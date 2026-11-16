import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  OperatorVerificationStatus,
  Prisma,
  SubscriptionPaymentMethod,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";

import {
  OPERATOR_PORT,
  OperatorEligibilityResult,
  OperatorPort,
} from "../../infra/operator/operator.port";
import {
  CarrierSubscriptionStatus,
  normalizeCarrierStatus,
} from "../../infra/bdapps/bdapps-status";
import {
  fromBdappsSubscriberId,
  isBdappsSubscriberId,
} from "../../infra/bdapps/bdapps-subscriber";
import {
  OperatorCancelInstructions,
  operatorUnsubscribeFailedError,
} from "../../infra/bdapps/bdapps.errors";
import { CarrierVerification } from "../../infra/sms/sms.port";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import {
  CreateSubscriptionPlanDto,
  RequestSubscriptionDto,
  SubscriptionQueryDto,
  UpdateAccessRuleDto,
  UpdateSubscriptionDto,
  UpdateSubscriptionPlanDto,
} from "./dto/subscriptions.dto";
import {
  FREE_MODULES,
  moduleForFeature,
  SubscriptionFeatures,
} from "./subscription-feature";

const subscriptionInclude = {
  plan: true,
  payments: { orderBy: { created_at: "desc" as const }, take: 1 },
} as const;
const configuredSubscriptionFeatures = new Set<string>(
  Object.values(SubscriptionFeatures),
);
const DAY_MS = 86_400_000;
/** Carrier renewals are only inferred from status, so keep a grace window. */
export const CARRIER_GRACE_MS = 6 * 3_600_000;
const OPERATOR_STATUS_REFRESH_MS = 60_000;

type PrismaTransaction = Prisma.TransactionClient;

export interface CarrierStatusUpdate {
  operatorCode: string;
  providerReference?: string | null;
  source: "cancel" | "otp_verify" | "status" | "webhook";
  status: CarrierSubscriptionStatus;
  /** Carrier-issued (possibly masked) id to store on the identity. */
  subscriberId?: string;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly carrierPlanCode: string;
  private readonly cancelInstructions: OperatorCancelInstructions;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OPERATOR_PORT) private readonly operatorPort: OperatorPort,
    @Optional() config?: ConfigService,
  ) {
    this.carrierPlanCode =
      config?.get<string>("BDAPPS_PLAN_CODE", "bdapps-daily") ?? "bdapps-daily";
    this.cancelInstructions = {
      shortCode: config?.get<string>("BDAPPS_SHORT_CODE", "21213") ?? "21213",
      smsKeyword:
        config?.get<string>("BDAPPS_SMS_KEYWORD", "STOP kaaj") ?? "STOP kaaj",
    };
  }

  /**
   * Associates a safe, unverified operator hint after authentication. Prefixes
   * are routing hints only; a provider or an administrator must verify them.
   */
  syncPhoneHint(userId: string, phoneE164: string) {
    return this.ensureOperatorHint(userId, phoneE164);
  }

  async mine(userId: string) {
    await this.expireSubscriptions(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone_e164: true },
    });
    if (!user?.phone_e164) throw new NotFoundException("User not found.");
    await this.ensureOperatorHint(userId, user.phone_e164);
    const operatorStatusRefreshFailed = await this.refreshOperatorStatus(
      userId,
      user.phone_e164,
    );
    const [
      identity,
      active,
      latest,
      plans,
      operators,
      accessRules,
      gateEnabled,
    ] = await Promise.all([
      this.prisma.userOperatorIdentity.findUnique({
        where: { user_id: userId },
        include: { operator: true },
      }),
      this.prisma.subscription.findFirst({
        where: {
          user_id: userId,
          status: SubscriptionStatus.ACTIVE,
          starts_at: { lte: new Date() },
          expires_at: { gt: new Date() },
        },
        include: subscriptionInclude,
        orderBy: { expires_at: "desc" },
      }),
      this.prisma.subscription.findFirst({
        where: { user_id: userId },
        include: subscriptionInclude,
        orderBy: { created_at: "desc" },
      }),
      this.prisma.subscriptionPlan.findMany({
        where: { is_active: true },
        orderBy: [{ sort_order: "asc" }, { price_poisha: "asc" }],
      }),
      this.prisma.mobileOperator.findMany({
        where: { is_active: true, supports_subscription: true },
        orderBy: { name_en: "asc" },
      }),
      this.prisma.subscriptionAccessRule.findMany({
        orderBy: { feature_key: "asc" },
      }),
      this.gateEnabled(),
    ]);
    const current = active ?? latest;
    const remoteBilling = this.operatorPort.managesRemoteBilling === true;
    const accessActive = !gateEnabled || active !== null;
    return {
      accessActive,
      gateEnabled,
      // Modules that never need a subscription (owner decision: Learn and
      // Community are free), and per-module access for the app's paywall.
      freeModules: [...FREE_MODULES],
      moduleAccess: {
        WORK: accessActive,
        BUSINESS: accessActive,
        LEARN: true,
        COMMUNITY: true,
      },
      operator: identity ? serializeIdentity(identity) : null,
      current: current ? serializeSubscription(current) : null,
      plans: plans.map(serializePlan),
      operators: operators.map((operator) => ({
        code: operator.code,
        nameEn: operator.name_en,
        nameBn: operator.name_bn,
      })),
      accessRules: accessRules.map((rule) => ({
        featureKey: rule.feature_key,
        isActive: rule.is_active,
        requiresActiveSubscription: rule.requires_active_subscription,
      })),
      onlinePaymentsEnabled: false,
      workerWithdrawalsEnabled: false,
      operatorStatusRefreshFailed,
      carrierStatus: remoteBilling
        ? normalizeCarrierStatus(identity?.provider_status)
        : null,
      operatorPlanMissing:
        remoteBilling &&
        !plans.some((plan) => plan.code === this.carrierPlanCode),
      cancelInstructions: { ...this.cancelInstructions, inApp: true },
    };
  }

  async history(userId: string) {
    await this.expireSubscriptions(userId);
    const items = await this.prisma.subscription.findMany({
      where: { user_id: userId },
      include: subscriptionInclude,
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return { items: items.map(serializeSubscription) };
  }

  async request(userId: string, input: RequestSubscriptionDto) {
    const [user, plan, operator] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone_e164: true },
      }),
      this.prisma.subscriptionPlan.findFirst({
        where: { id: input.planId, is_active: true },
      }),
      this.prisma.mobileOperator.findFirst({
        where: {
          code: input.operatorCode,
          is_active: true,
          supports_subscription: true,
        },
      }),
    ]);
    if (!user?.phone_e164) throw new NotFoundException("User not found.");
    if (!plan) throw new NotFoundException("Subscription plan not found.");
    if (!operator)
      throw new ConflictException("This operator is not supported.");
    const active = await this.activeSubscription(userId);
    if (active)
      throw new ConflictException("You already have an active subscription.");
    const existingPending = await this.prisma.subscription.findFirst({
      where: {
        user_id: userId,
        plan_id: plan.id,
        status: SubscriptionStatus.PENDING,
      },
      orderBy: { created_at: "desc" },
    });
    if (existingPending) return this.mine(userId);

    const storedIdentity = await this.prisma.userOperatorIdentity.findUnique({
      where: { user_id: userId },
      select: { provider_subscriber_id: true },
    });
    const eligibility = await this.operatorPort.checkEligibility({
      operatorCode: operator.code,
      phoneE164: user.phone_e164,
      subscriberId: storedIdentity?.provider_subscriber_id ?? null,
    });
    if (
      eligibility.status === "REJECTED" ||
      eligibility.status === "UNSUPPORTED"
    )
      throw new ConflictException(
        "Operator subscription eligibility was not confirmed.",
      );

    const activated = eligibility.status === "VERIFIED";
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.userOperatorIdentity.upsert({
        where: { user_id: userId },
        create: {
          user_id: userId,
          operator_id: operator.id,
          status: eligibility.status,
          provider_ref: eligibility.providerReference,
          provider_status: eligibility.carrierStatus ?? null,
          last_checked_at: new Date(),
        },
        update: {
          operator_id: operator.id,
          status: eligibility.status,
          provider_ref: eligibility.providerReference,
          provider_status: eligibility.carrierStatus ?? undefined,
          last_checked_at: new Date(),
          verified_at: eligibility.status === "VERIFIED" ? new Date() : null,
        },
      });
      const subscription = await transaction.subscription.create({
        data: {
          user_id: userId,
          plan_id: plan.id,
          status: activated
            ? SubscriptionStatus.ACTIVE
            : SubscriptionStatus.PENDING,
          starts_at: activated ? now : null,
          expires_at: activated
            ? new Date(now.getTime() + plan.duration_days * 86_400_000)
            : null,
        },
      });
      await transaction.subscriptionPayment.create({
        data: {
          subscription_id: subscription.id,
          user_id: userId,
          amount_poisha: plan.price_poisha,
          currency: plan.currency,
          method: SubscriptionPaymentMethod.OPERATOR_BILLING,
          status: activated
            ? SubscriptionPaymentStatus.PAID
            : SubscriptionPaymentStatus.PENDING,
          provider_ref: eligibility.providerReference,
          paid_at: activated ? now : null,
        },
      });
      await transaction.auditLog.create({
        data: {
          actor_user_id: userId,
          action: "subscription.requested",
          entity: "subscription",
          entity_id: subscription.id,
          before_json: Prisma.JsonNull,
          after_json: {
            operatorCode: operator.code,
            planId: plan.id,
            status: activated
              ? SubscriptionStatus.ACTIVE
              : SubscriptionStatus.PENDING,
          },
        },
      });
    });
    return this.mine(userId);
  }

  async cancel(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        user_id: userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING] },
      },
      orderBy: { created_at: "desc" },
    });
    if (!subscription) {
      // The carrier may still be billing without a local entitlement (e.g. the
      // carrier plan was missing): in-app cancel must still stop billing.
      if (await this.carrierStillBilling(userId))
        return this.cancelWithCarrier(userId, null);
      throw new ConflictException(
        "There is no active or pending subscription to cancel.",
      );
    }
    if (
      this.operatorPort.managesRemoteBilling &&
      subscription.status === SubscriptionStatus.ACTIVE
    ) {
      return this.cancelWithCarrier(userId, subscription.id);
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.CANCELLED, cancelled_at: now },
      }),
      this.prisma.subscriptionPayment.updateMany({
        where: {
          subscription_id: subscription.id,
          status: SubscriptionPaymentStatus.PENDING,
        },
        data: { status: SubscriptionPaymentStatus.CANCELLED },
      }),
      this.prisma.auditLog.create({
        data: {
          actor_user_id: userId,
          action: "subscription.cancelled",
          entity: "subscription",
          entity_id: subscription.id,
          before_json: { status: subscription.status },
          after_json: { status: SubscriptionStatus.CANCELLED },
        },
      }),
    ]);
    return this.mine(userId);
  }

  async accessFor(userId: string, featureKey: string) {
    // Learn and Community are free whatever the flags or rules say.
    if (FREE_MODULES.includes(moduleForFeature(featureKey)))
      return { allowed: true, gated: false };
    if (!(await this.gateEnabled())) return { allowed: true, gated: false };
    const rule = await this.prisma.subscriptionAccessRule.findUnique({
      where: { feature_key: featureKey },
    });
    if (!rule?.is_active || !rule.requires_active_subscription)
      return { allowed: true, gated: false };
    await this.expireSubscriptions(userId);
    const active = await this.activeSubscription(userId);
    if (active !== null)
      return {
        allowed: await this.planCovers(active.plan_id, featureKey),
        gated: true,
      };
    if (!this.operatorPort.managesRemoteBilling)
      return { allowed: false, gated: true };
    // Daily carrier renewals are only visible through status: re-check (throttled)
    // so access continues without the user opening the subscription screen.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone_e164: true },
    });
    if (user?.phone_e164) {
      await this.ensureOperatorHint(userId, user.phone_e164);
      await this.refreshOperatorStatus(userId, user.phone_e164);
    }
    const refreshed = await this.activeSubscription(userId);
    return {
      allowed:
        refreshed !== null &&
        (await this.planCovers(refreshed.plan_id, featureKey)),
      gated: true,
    };
  }

  /**
   * With module_entitlements_enabled on, a plan unlocks only the features in
   * its feature_keys (an empty list still means "every feature", as for the
   * plans created before). Off — the default — any active plan unlocks
   * everything, as before.
   */
  private async planCovers(planId: string, featureKey: string) {
    if (!(await this.moduleEntitlementsEnabled())) return true;
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      select: { feature_keys: true },
    });
    return (
      plan !== null &&
      (plan.feature_keys.length === 0 || plan.feature_keys.includes(featureKey))
    );
  }

  private async moduleEntitlementsEnabled() {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key: "module_entitlements_enabled" },
    });
    return flag?.is_enabled === true && flag.rollout_percent === 100;
  }

  async adminOverview() {
    const [subscriptions, payments, operators, plans, accessRules] =
      await Promise.all([
        this.prisma.subscription.groupBy({ by: ["status"], _count: true }),
        this.prisma.subscriptionPayment.groupBy({
          by: ["status"],
          _count: true,
        }),
        this.prisma.userOperatorIdentity.groupBy({
          by: ["status"],
          _count: true,
        }),
        this.prisma.subscriptionPlan.findMany({
          orderBy: [{ sort_order: "asc" }, { created_at: "desc" }],
        }),
        this.prisma.subscriptionAccessRule.findMany({
          orderBy: { feature_key: "asc" },
        }),
      ]);
    return {
      subscriptions: Object.fromEntries(
        subscriptions.map((item) => [item.status, item._count]),
      ),
      payments: Object.fromEntries(
        payments.map((item) => [item.status, item._count]),
      ),
      operators: Object.fromEntries(
        operators.map((item) => [item.status, item._count]),
      ),
      plans: plans.map(serializePlan),
      accessRules: accessRules.map((rule) => ({
        featureKey: rule.feature_key,
        isActive: rule.is_active,
        requiresActiveSubscription: rule.requires_active_subscription,
        description: rule.description,
      })),
    };
  }

  async adminList(query: SubscriptionQueryDto) {
    const items = await this.prisma.subscription.findMany({
      where: query.status ? { status: query.status } : undefined,
      include: {
        ...subscriptionInclude,
        user: {
          select: {
            phone_e164: true,
            profile: { select: { display_name: true } },
            operator_identity: { include: { operator: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: query.limit,
    });
    return {
      items: items.map((item) => ({
        ...serializeSubscription(item),
        user: {
          displayName: item.user.profile?.display_name ?? "Profile incomplete",
          maskedPhone: maskPhone(item.user.phone_e164),
          operator: item.user.operator_identity
            ? serializeIdentity(item.user.operator_identity)
            : null,
        },
      })),
    };
  }

  async createPlan(
    input: CreateSubscriptionPlanDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const plan = await this.prisma.subscriptionPlan.create({
      data: {
        code: input.code,
        name_en: input.nameEn,
        name_bn: input.nameBn,
        description_en: input.descriptionEn,
        description_bn: input.descriptionBn,
        price_poisha: BigInt(input.pricePoisha),
        duration_days: input.durationDays,
        feature_keys: input.featureKeys,
        is_active: input.isActive,
        sort_order: input.sortOrder,
      },
    });
    await this.audit(
      actor,
      context,
      "subscription.plan.created",
      plan.id,
      null,
      {
        code: plan.code,
        reason: input.reason,
      },
    );
    return serializePlan(plan);
  }

  async updatePlan(
    id: string,
    input: UpdateSubscriptionPlanDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const current = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException("Subscription plan not found.");
    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        name_en: input.nameEn,
        name_bn: input.nameBn,
        description_en: input.descriptionEn,
        description_bn: input.descriptionBn,
        price_poisha: input.pricePoisha ? BigInt(input.pricePoisha) : undefined,
        duration_days: input.durationDays,
        feature_keys: input.featureKeys,
        is_active: input.isActive,
        sort_order: input.sortOrder,
      },
    });
    await this.audit(
      actor,
      context,
      "subscription.plan.updated",
      id,
      serializePlan(current),
      {
        ...serializePlan(updated),
        reason: input.reason,
      },
    );
    return serializePlan(updated);
  }

  async updateSubscription(
    id: string,
    input: UpdateSubscriptionDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const current = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        ...subscriptionInclude,
        user: { select: { operator_identity: true } },
      },
    });
    if (!current) throw new NotFoundException("Subscription not found.");
    const now = new Date();
    if (
      input.status === SubscriptionStatus.ACTIVE &&
      current.user.operator_identity?.status !==
        OperatorVerificationStatus.VERIFIED &&
      input.operatorVerified !== true
    ) {
      throw new ConflictException(
        "Operator eligibility must be verified before activation.",
      );
    }
    if (
      input.status === SubscriptionStatus.ACTIVE &&
      (!current.payments[0] ||
        (current.payments[0].status !== SubscriptionPaymentStatus.PAID &&
          input.paymentStatus !== SubscriptionPaymentStatus.PAID))
    ) {
      throw new ConflictException(
        "Confirmed payment is required before subscription activation.",
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      if (input.operatorVerified === true) {
        if (!current.user.operator_identity?.operator_id) {
          throw new ConflictException(
            "Choose a supported operator before verification.",
          );
        }
        await transaction.userOperatorIdentity.update({
          where: { user_id: current.user_id },
          data: {
            status: OperatorVerificationStatus.VERIFIED,
            verified_at: now,
          },
        });
      }
      const activating = input.status === SubscriptionStatus.ACTIVE;
      await transaction.subscription.update({
        where: { id },
        data: {
          status: input.status,
          starts_at: activating
            ? (current.starts_at ?? now)
            : current.starts_at,
          expires_at: activating
            ? (current.expires_at ??
              new Date(now.getTime() + current.plan.duration_days * 86_400_000))
            : current.expires_at,
          cancelled_at:
            input.status === SubscriptionStatus.CANCELLED ? now : null,
        },
      });
      const paymentStatus = input.paymentStatus;
      if (paymentStatus) {
        const payment = current.payments[0];
        if (payment) {
          await transaction.subscriptionPayment.update({
            where: { id: payment.id },
            data: {
              status: paymentStatus,
              method:
                paymentStatus === SubscriptionPaymentStatus.PAID
                  ? SubscriptionPaymentMethod.MANUAL_ADMIN
                  : payment.method,
              paid_at:
                paymentStatus === SubscriptionPaymentStatus.PAID
                  ? (payment.paid_at ?? now)
                  : null,
            },
          });
        }
      }
      await transaction.auditLog.create({
        data: {
          actor_user_id: actor.userId,
          action: "subscription.status.updated",
          entity: "subscription",
          entity_id: id,
          before_json: { status: current.status },
          after_json: {
            operatorVerified: input.operatorVerified === true,
            paymentStatus: input.paymentStatus ?? null,
            reason: input.reason,
            status: input.status,
          },
          ip: context.ip,
          ua: context.ua,
        },
      });
    });
    return this.prisma.subscription
      .findUniqueOrThrow({ where: { id }, include: subscriptionInclude })
      .then(serializeSubscription);
  }

  async updateAccessRule(
    featureKey: string,
    input: UpdateAccessRuleDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    if (!configuredSubscriptionFeatures.has(featureKey)) {
      throw new BadRequestException("Unknown subscription feature.");
    }
    const before = await this.prisma.subscriptionAccessRule.findUnique({
      where: { feature_key: featureKey },
    });
    const rule = await this.prisma.subscriptionAccessRule.upsert({
      where: { feature_key: featureKey },
      create: {
        feature_key: featureKey,
        requires_active_subscription: input.requiresActiveSubscription,
        is_active: input.isActive,
        description: input.description,
      },
      update: {
        requires_active_subscription: input.requiresActiveSubscription,
        is_active: input.isActive,
        description: input.description,
      },
    });
    await this.audit(
      actor,
      context,
      "subscription.access-rule.updated",
      null,
      before,
      {
        ...rule,
        reason: input.reason,
      },
    );
    return {
      featureKey: rule.feature_key,
      isActive: rule.is_active,
      requiresActiveSubscription: rule.requires_active_subscription,
      description: rule.description,
    };
  }

  private async activeSubscription(userId: string) {
    const now = new Date();
    return this.prisma.subscription.findFirst({
      where: {
        user_id: userId,
        status: SubscriptionStatus.ACTIVE,
        starts_at: { lte: now },
        expires_at: { gt: now },
      },
      orderBy: { expires_at: "desc" },
    });
  }

  private async expireSubscriptions(userId: string) {
    await this.prisma.subscription.updateMany({
      where: {
        user_id: userId,
        status: SubscriptionStatus.ACTIVE,
        expires_at: { lte: new Date() },
      },
      data: { status: SubscriptionStatus.EXPIRED },
    });
  }

  async applyBdappsWebhook(input: {
    frequency?: string | null;
    providerEventId: string | null;
    providerTimeStamp?: string | null;
    status: "REGISTERED" | "UNSUBSCRIBED" | "CHARGE_PENDING";
    subscriberId: string;
  }) {
    if (!isBdappsSubscriberId(input.subscriberId))
      throw new BadRequestException("Invalid subscriberId.");
    // Resolve by the stored carrier id first (works for masked ids), then by number.
    const byStoredId = await this.prisma.userOperatorIdentity.findUnique({
      where: { provider_subscriber_id: input.subscriberId },
      select: { user: { select: { id: true, phone_e164: true } } },
    });
    let user = byStoredId?.user ?? null;
    if (!user) {
      const phoneE164 = fromBdappsSubscriberId(input.subscriberId);
      if (!phoneE164) return { processed: false };
      user = await this.prisma.user.findUnique({
        where: { phone_e164: phoneE164 },
        select: { id: true, phone_e164: true },
      });
    }
    if (!user) return { processed: false };

    if (user.phone_e164)
      await this.ensureOperatorHint(user.id, user.phone_e164);
    const identity = await this.prisma.userOperatorIdentity.findUnique({
      where: { user_id: user.id },
      include: { operator: true },
    });
    if (!identity?.operator) return { processed: false };

    await this.applyCarrierStatus(user.id, {
      operatorCode: identity.operator.code,
      providerReference: input.providerEventId,
      source: "webhook",
      status: input.status === "UNSUBSCRIBED" ? "UNREGISTERED" : input.status,
      // Never replace an id learnt from OTP verification with a webhook value.
      subscriberId: identity.provider_subscriber_id
        ? undefined
        : input.subscriberId,
    });
    return { processed: true };
  }

  /**
   * Best-effort, realtime entitlement after a successful carrier OTP verification
   * (login, registration or recovery). Stores the carrier subscriber id.
   */
  async onCarrierVerified(
    userId: string,
    phoneE164: string,
    carrier: CarrierVerification,
  ): Promise<{ applied: boolean }> {
    const status = normalizeCarrierStatus(carrier.subscriptionStatus);
    if (!status) {
      this.logger.warn({
        event: "bdapps_verify_unknown_status",
        userId,
      });
      return { applied: false };
    }
    await this.ensureOperatorHint(userId, phoneE164);
    const identity = await this.prisma.userOperatorIdentity.findUnique({
      where: { user_id: userId },
      include: { operator: true },
    });
    if (!identity?.operator) return { applied: false };
    await this.applyCarrierStatus(userId, {
      operatorCode: identity.operator.code,
      source: "otp_verify",
      status,
      subscriberId: isBdappsSubscriberId(carrier.subscriberId)
        ? carrier.subscriberId
        : undefined,
    });
    return { applied: true };
  }

  private async refreshOperatorStatus(
    userId: string,
    phoneE164: string,
  ): Promise<boolean> {
    if (!this.operatorPort.managesRemoteBilling) return false;
    const identity = await this.prisma.userOperatorIdentity.findUnique({
      where: { user_id: userId },
      include: { operator: true },
    });
    if (!identity?.operator) return false;
    if (
      identity.last_checked_at &&
      Date.now() - identity.last_checked_at.getTime() <
        OPERATOR_STATUS_REFRESH_MS
    ) {
      return false;
    }
    try {
      const eligibility = await this.operatorPort.checkEligibility({
        operatorCode: identity.operator.code,
        phoneE164,
        subscriberId: identity.provider_subscriber_id,
      });
      await this.syncOperatorEligibility(userId, eligibility);
      return false;
    } catch {
      return true;
    }
  }

  private async syncOperatorEligibility(
    userId: string,
    eligibility: OperatorEligibilityResult,
  ): Promise<void> {
    await this.applyCarrierStatus(userId, {
      operatorCode: eligibility.operatorCode,
      providerReference: eligibility.providerReference,
      source: "status",
      status:
        eligibility.carrierStatus ??
        (eligibility.status === "VERIFIED" ? "REGISTERED" : "UNREGISTERED"),
    });
  }

  /**
   * Single writer for carrier-driven entitlement:
   * REGISTERED extends/activates/creates access, UNREGISTERED cancels active
   * access, CHARGE_PENDING keeps the current entitlement untouched.
   */
  async applyCarrierStatus(
    userId: string,
    update: CarrierStatusUpdate,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      // Serialize concurrent verify/webhook/status updates for the same user.
      await transaction.$queryRaw`SELECT "id" FROM "user_operator_identities" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
      const identity = await transaction.userOperatorIdentity.findUnique({
        where: { user_id: userId },
        select: { status: true, verified_at: true },
      });
      if (!identity) return;
      if (update.subscriberId) {
        // A verified id belongs to exactly one account (numbers can be recycled).
        await transaction.userOperatorIdentity.updateMany({
          where: {
            provider_subscriber_id: update.subscriberId,
            user_id: { not: userId },
          },
          data: { provider_subscriber_id: null },
        });
      }
      await transaction.userOperatorIdentity.update({
        where: { user_id: userId },
        data: {
          provider_status: update.status,
          last_checked_at: now,
          ...(update.subscriberId
            ? { provider_subscriber_id: update.subscriberId }
            : {}),
          ...(update.providerReference !== undefined
            ? { provider_ref: update.providerReference }
            : {}),
          ...(update.status === "REGISTERED"
            ? {
                status: OperatorVerificationStatus.VERIFIED,
                verified_at:
                  identity.status === OperatorVerificationStatus.VERIFIED
                    ? (identity.verified_at ?? now)
                    : now,
              }
            : {}),
          ...(update.status === "UNREGISTERED"
            ? { status: OperatorVerificationStatus.PENDING, verified_at: null }
            : {}),
        },
      });
      if (update.status === "REGISTERED") {
        await this.grantCarrierEntitlement(transaction, userId, update, now);
      } else if (update.status === "UNREGISTERED") {
        await this.cancelActiveForCarrier(transaction, userId, update, now);
      }
      // CHARGE_PENDING: keep whatever entitlement exists until it expires.
    });
  }

  private async grantCarrierEntitlement(
    transaction: PrismaTransaction,
    userId: string,
    update: CarrierStatusUpdate,
    now: Date,
  ): Promise<void> {
    const active = await transaction.subscription.findFirst({
      where: {
        user_id: userId,
        status: SubscriptionStatus.ACTIVE,
        starts_at: { lte: now },
        expires_at: { gt: now },
      },
      include: { plan: true },
      orderBy: { expires_at: "desc" },
    });
    if (active) {
      const periodEnd = now.getTime() + active.plan.duration_days * DAY_MS;
      // Extend only once less than a full period of cover remains, so frequent
      // status polls do not write an audit row each time.
      if (active.expires_at && active.expires_at.getTime() >= periodEnd) return;
      const expiresAt = new Date(
        Math.max(
          active.expires_at?.getTime() ?? 0,
          periodEnd + CARRIER_GRACE_MS,
        ),
      );
      await transaction.subscription.update({
        where: { id: active.id },
        data: { expires_at: expiresAt },
      });
      // Renewal is inferred from carrier state: audit it, never invent a payment.
      await transaction.auditLog.create({
        data: {
          actor_user_id: userId,
          action: "subscription.operator-renewed",
          entity: "subscription",
          entity_id: active.id,
          before_json: {
            expiresAt: active.expires_at?.toISOString() ?? null,
          },
          after_json: {
            expiresAt: expiresAt.toISOString(),
            operatorCode: update.operatorCode,
            source: update.source,
          },
        },
      });
      return;
    }

    const pending = await transaction.subscription.findFirst({
      where: { user_id: userId, status: SubscriptionStatus.PENDING },
      include: { plan: true },
      orderBy: { created_at: "desc" },
    });
    if (pending) {
      await transaction.subscription.update({
        where: { id: pending.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          starts_at: now,
          expires_at: new Date(
            now.getTime() +
              pending.plan.duration_days * DAY_MS +
              CARRIER_GRACE_MS,
          ),
        },
      });
      await transaction.subscriptionPayment.updateMany({
        where: {
          subscription_id: pending.id,
          status: SubscriptionPaymentStatus.PENDING,
        },
        data: {
          status: SubscriptionPaymentStatus.PAID,
          provider_ref: update.providerReference ?? "operator-confirmed",
          paid_at: now,
        },
      });
      await transaction.auditLog.create({
        data: {
          actor_user_id: userId,
          action: "subscription.operator-activated",
          entity: "subscription",
          entity_id: pending.id,
          before_json: { status: SubscriptionStatus.PENDING },
          after_json: {
            operatorCode: update.operatorCode,
            source: update.source,
            status: SubscriptionStatus.ACTIVE,
          },
        },
      });
      return;
    }

    const plan = await transaction.subscriptionPlan.findFirst({
      where: { code: this.carrierPlanCode, is_active: true },
    });
    if (!plan) {
      this.logger.warn({
        event: "bdapps_carrier_plan_missing",
        planCode: this.carrierPlanCode,
        userId,
      });
      return;
    }
    const subscription = await transaction.subscription.create({
      data: {
        user_id: userId,
        plan_id: plan.id,
        status: SubscriptionStatus.ACTIVE,
        starts_at: now,
        expires_at: new Date(
          now.getTime() + plan.duration_days * DAY_MS + CARRIER_GRACE_MS,
        ),
      },
    });
    await transaction.subscriptionPayment.create({
      data: {
        subscription_id: subscription.id,
        user_id: userId,
        amount_poisha: plan.price_poisha,
        currency: plan.currency,
        method: SubscriptionPaymentMethod.OPERATOR_BILLING,
        status: SubscriptionPaymentStatus.PAID,
        provider_ref: "operator-confirmed",
        paid_at: now,
      },
    });
    await transaction.auditLog.create({
      data: {
        actor_user_id: userId,
        action: "subscription.operator-activated",
        entity: "subscription",
        entity_id: subscription.id,
        before_json: Prisma.JsonNull,
        after_json: {
          operatorCode: update.operatorCode,
          planCode: plan.code,
          source: update.source,
          status: SubscriptionStatus.ACTIVE,
        },
      },
    });
  }

  private async cancelActiveForCarrier(
    transaction: PrismaTransaction,
    userId: string,
    update: CarrierStatusUpdate,
    now: Date,
  ): Promise<void> {
    const activeSubscriptions = await transaction.subscription.findMany({
      where: { user_id: userId, status: SubscriptionStatus.ACTIVE },
      select: { id: true },
    });
    if (activeSubscriptions.length === 0) return;
    await transaction.subscription.updateMany({
      where: { id: { in: activeSubscriptions.map((item) => item.id) } },
      data: { status: SubscriptionStatus.CANCELLED, cancelled_at: now },
    });
    await transaction.auditLog.create({
      data: {
        actor_user_id: userId,
        action:
          update.source === "cancel"
            ? "subscription.operator-cancelled"
            : "subscription.operator-deactivated",
        entity: "subscription",
        entity_id: activeSubscriptions[0]?.id ?? null,
        before_json: { status: SubscriptionStatus.ACTIVE },
        after_json: {
          operatorCode: update.operatorCode,
          source: update.source,
          status: SubscriptionStatus.CANCELLED,
        },
      },
    });
  }

  /** In-app cancellation: stop carrier billing first, then end access now. */
  private async carrierStillBilling(userId: string): Promise<boolean> {
    if (!this.operatorPort.managesRemoteBilling) return false;
    const identity = await this.prisma.userOperatorIdentity.findUnique({
      where: { user_id: userId },
      select: { provider_status: true },
    });
    const status = normalizeCarrierStatus(identity?.provider_status);
    return status === "REGISTERED" || status === "CHARGE_PENDING";
  }

  private async cancelWithCarrier(
    userId: string,
    subscriptionId: string | null,
  ) {
    const [user, identity] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone_e164: true },
      }),
      this.prisma.userOperatorIdentity.findUnique({
        where: { user_id: userId },
        include: { operator: true },
      }),
    ]);
    if (!user?.phone_e164 || !this.operatorPort.cancelSubscription) {
      throw operatorUnsubscribeFailedError(this.cancelInstructions);
    }
    try {
      await this.operatorPort.cancelSubscription({
        phoneE164: user.phone_e164,
        subscriberId: identity?.provider_subscriber_id ?? null,
      });
    } catch {
      this.logger.warn({ event: "bdapps_unsubscribe_failed", userId });
      throw operatorUnsubscribeFailedError(this.cancelInstructions);
    }
    if (identity) {
      await this.applyCarrierStatus(userId, {
        operatorCode: identity.operator?.code ?? "UNKNOWN",
        source: "cancel",
        status: "UNREGISTERED",
      });
    }
    const now = new Date();
    // Also end the selected subscription when no identity row exists, plus any
    // pending request a later REGISTERED event would otherwise activate.
    await this.prisma.$transaction([
      this.prisma.subscription.updateMany({
        where: {
          user_id: userId,
          OR: [
            ...(subscriptionId
              ? [{ id: subscriptionId, status: SubscriptionStatus.ACTIVE }]
              : []),
            { status: SubscriptionStatus.PENDING },
          ],
        },
        data: { status: SubscriptionStatus.CANCELLED, cancelled_at: now },
      }),
      this.prisma.subscriptionPayment.updateMany({
        where: { user_id: userId, status: SubscriptionPaymentStatus.PENDING },
        data: { status: SubscriptionPaymentStatus.CANCELLED },
      }),
    ]);
    return this.mine(userId);
  }

  private async gateEnabled() {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key: "subscriptions_enabled" },
    });
    return flag?.is_enabled === true && flag.rollout_percent === 100;
  }

  private async ensureOperatorHint(userId: string, phoneE164: string) {
    const current = await this.prisma.userOperatorIdentity.findUnique({
      where: { user_id: userId },
    });
    if (
      current?.status === OperatorVerificationStatus.VERIFIED ||
      current?.operator_id
    )
      return;
    const operators = await this.prisma.mobileOperator.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
    });
    const hint = operators.find((operator) =>
      operator.number_prefixes.some((prefix) => phoneE164.startsWith(prefix)),
    );
    await this.prisma.userOperatorIdentity.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        operator_id: hint?.id,
        status: hint
          ? OperatorVerificationStatus.PENDING
          : OperatorVerificationStatus.UNSUPPORTED,
      },
      update: {
        operator_id: hint?.id,
        status: hint
          ? OperatorVerificationStatus.PENDING
          : OperatorVerificationStatus.UNSUPPORTED,
      },
    });
  }

  private async audit(
    actor: AdminActor,
    context: AdminRequestContext,
    action: string,
    entityId: string | null,
    before: unknown,
    after: unknown,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actor_user_id: actor.userId,
        action,
        entity: "subscription",
        entity_id: entityId,
        before_json: jsonValue(before),
        after_json: jsonValue(after),
        ip: context.ip,
        ua: context.ua,
      },
    });
  }
}

function serializePlan(plan: {
  id: string;
  code: string;
  name_en: string;
  name_bn: string;
  description_en: string | null;
  description_bn: string | null;
  price_poisha: bigint;
  currency: string;
  duration_days: number;
  feature_keys: string[];
  is_active: boolean;
  sort_order: number;
}) {
  return {
    id: plan.id,
    code: plan.code,
    nameEn: plan.name_en,
    nameBn: plan.name_bn,
    descriptionEn: plan.description_en,
    descriptionBn: plan.description_bn,
    pricePoisha: plan.price_poisha.toString(),
    currency: plan.currency,
    durationDays: plan.duration_days,
    featureKeys: plan.feature_keys,
    isActive: plan.is_active,
    sortOrder: plan.sort_order,
  };
}

function serializeSubscription(subscription: {
  id: string;
  status: SubscriptionStatus;
  starts_at: Date | null;
  expires_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  plan: Parameters<typeof serializePlan>[0];
  payments: Array<{
    status: SubscriptionPaymentStatus;
    method: SubscriptionPaymentMethod;
    paid_at: Date | null;
  }>;
}) {
  const payment = subscription.payments[0];
  return {
    id: subscription.id,
    status: subscription.status,
    startsAt: subscription.starts_at?.toISOString() ?? null,
    expiresAt: subscription.expires_at?.toISOString() ?? null,
    cancelledAt: subscription.cancelled_at?.toISOString() ?? null,
    createdAt: subscription.created_at.toISOString(),
    plan: serializePlan(subscription.plan),
    payment: payment
      ? {
          status: payment.status,
          method: payment.method,
          paidAt: payment.paid_at?.toISOString() ?? null,
        }
      : null,
  };
}

function serializeIdentity(identity: {
  status: OperatorVerificationStatus;
  verified_at: Date | null;
  last_checked_at: Date | null;
  operator: {
    code: string;
    name_en: string;
    name_bn: string;
    supports_subscription: boolean;
  } | null;
}) {
  return {
    status: identity.status,
    verifiedAt: identity.verified_at?.toISOString() ?? null,
    lastCheckedAt: identity.last_checked_at?.toISOString() ?? null,
    operator: identity.operator
      ? {
          code: identity.operator.code,
          nameEn: identity.operator.name_en,
          nameBn: identity.operator.name_bn,
          supportsSubscription: identity.operator.supports_subscription,
        }
      : null,
  };
}

function maskPhone(phone: string | null) {
  if (!phone || phone.length < 6) return "Unavailable";
  return `${phone.slice(0, 6)}••••${phone.slice(-2)}`;
}

function jsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as Prisma.InputJsonValue;
}

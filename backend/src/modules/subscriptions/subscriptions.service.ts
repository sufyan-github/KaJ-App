import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  OperatorVerificationStatus,
  Prisma,
  SubscriptionPaymentMethod,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";

import {
  OPERATOR_PORT,
  OperatorPort,
} from "../../infra/operator/operator.port";
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
import { SubscriptionFeatures } from "./subscription-feature";

const subscriptionInclude = {
  plan: true,
  payments: { orderBy: { created_at: "desc" as const }, take: 1 },
} as const;
const configuredSubscriptionFeatures = new Set<string>(
  Object.values(SubscriptionFeatures),
);

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OPERATOR_PORT) private readonly operatorPort: OperatorPort,
  ) {}

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
    return {
      accessActive: !gateEnabled || active !== null,
      gateEnabled,
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

    const eligibility = await this.operatorPort.checkEligibility({
      operatorCode: operator.code,
      phoneE164: user.phone_e164,
    });
    if (
      eligibility.status === "REJECTED" ||
      eligibility.status === "UNSUPPORTED"
    )
      throw new ConflictException(
        "Operator subscription eligibility was not confirmed.",
      );

    await this.prisma.$transaction(async (transaction) => {
      await transaction.userOperatorIdentity.upsert({
        where: { user_id: userId },
        create: {
          user_id: userId,
          operator_id: operator.id,
          status: eligibility.status,
          provider_ref: eligibility.providerReference,
          last_checked_at: new Date(),
        },
        update: {
          operator_id: operator.id,
          status: eligibility.status,
          provider_ref: eligibility.providerReference,
          last_checked_at: new Date(),
          verified_at: eligibility.status === "VERIFIED" ? new Date() : null,
        },
      });
      const subscription = await transaction.subscription.create({
        data: {
          user_id: userId,
          plan_id: plan.id,
          status: SubscriptionStatus.PENDING,
        },
      });
      await transaction.subscriptionPayment.create({
        data: {
          subscription_id: subscription.id,
          user_id: userId,
          amount_poisha: plan.price_poisha,
          currency: plan.currency,
          method: SubscriptionPaymentMethod.OPERATOR_BILLING,
          status: SubscriptionPaymentStatus.PENDING,
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
            status: SubscriptionStatus.PENDING,
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
    if (!subscription)
      throw new ConflictException(
        "There is no active or pending subscription to cancel.",
      );
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
    if (!(await this.gateEnabled())) return { allowed: true, gated: false };
    const rule = await this.prisma.subscriptionAccessRule.findUnique({
      where: { feature_key: featureKey },
    });
    if (!rule?.is_active || !rule.requires_active_subscription)
      return { allowed: true, gated: false };
    await this.expireSubscriptions(userId);
    return {
      allowed: (await this.activeSubscription(userId)) !== null,
      gated: true,
    };
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

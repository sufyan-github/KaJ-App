import { createHash } from "node:crypto";

import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";
import {
  calculateBreakdown,
  FeePayer,
  FeeRuleValue,
  resolveFeeRule,
} from "./fee-resolver";
import { NotificationsService } from "../notifications/notifications.service";
import { JobStateMachine } from "../jobs/state-machine/job-state.machine";
import { AssignmentStatus, JobActorType, JobStatus } from "@prisma/client";

export interface PaymentIntentResponse {
  agreedPoisha: string;
  currency: string;
  customerPaysPoisha: string;
  digitalPaymentsEnabled: boolean;
  feePayer: FeePayer;
  feePoisha: string;
  feeRule: string;
  method: PaymentMethod;
  paymentId: string;
  status: PaymentStatus;
  workerReceivesPoisha: string;
}

@Injectable()
export class PaymentsService {
  private readonly states = new JobStateMachine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  capabilities() {
    return {
      cashOnCompletion: true,
      digitalPayments: false,
      mobileBanking: false,
      onlinePayments: false,
      wallet: false,
      workerWithdrawals: false,
    };
  }

  async adminOverview() {
    const [counts, recent] = await Promise.all([
      this.prisma.payment.groupBy({ by: ["status"], _count: true }),
      this.prisma.payment.findMany({
        include: {
          assignment: { select: { worker_user_id: true } },
          job: { select: { title: true, currency: true } },
          payer: { select: { phone_e164: true } },
        },
        orderBy: { created_at: "desc" },
        take: 100,
      }),
    ]);
    return {
      capabilities: this.capabilities(),
      counts: Object.fromEntries(
        counts.map((item) => [item.status, item._count]),
      ),
      items: recent.map((item) => ({
        ...serializeHistory(item, item.payer_user_id),
        payerMaskedPhone: maskPhone(item.payer.phone_e164),
        workerUserId: item.assignment.worker_user_id,
      })),
    };
  }

  async history(userId: string) {
    const items = await this.prisma.payment.findMany({
      where: {
        OR: [
          { payer_user_id: userId },
          { assignment: { worker_user_id: userId } },
        ],
      },
      include: {
        assignment: { select: { worker_user_id: true } },
        job: { select: { title: true, currency: true } },
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return { items: items.map((item) => serializeHistory(item, userId)) };
  }

  async forAssignment(userId: string, assignmentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        assignment_id: assignmentId,
        OR: [
          { payer_user_id: userId },
          { assignment: { worker_user_id: userId } },
        ],
      },
      include: {
        assignment: { select: { worker_user_id: true } },
        job: { select: { title: true, currency: true } },
      },
    });
    return payment ? serializeHistory(payment, userId) : null;
  }

  async markCashPaid(posterUserId: string, assignmentId: string) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`cash-payment:${assignmentId}`}, 0))
      `;
      const assignment = await transaction.assignment.findUnique({
        where: { id: assignmentId },
        include: { job: true },
      });
      if (!assignment || assignment.job.poster_user_id !== posterUserId)
        throw new NotFoundException("Assignment not found.");
      if (assignment.status !== AssignmentStatus.COMPLETED)
        throw new ConflictException(
          "Complete the work before recording payment.",
        );
      if (
        assignment.job.status !== JobStatus.COMPLETED &&
        assignment.job.status !== JobStatus.PAYMENT_RECORDED
      ) {
        throw new ConflictException(
          "This job cannot record a cash payment now.",
        );
      }
      let payment = await this.ensureCashPending(transaction, assignment);
      if (payment.method !== PaymentMethod.CASH_ON_COMPLETION)
        throw new ConflictException(
          "This assignment is not using cash on completion.",
        );
      if (payment.status === PaymentStatus.DISPUTED)
        throw new ConflictException(
          "Resolve the payment dispute before recording payment.",
        );
      if (payment.status !== PaymentStatus.CASH_RECORDED) {
        payment = await transaction.payment.update({
          where: { id: payment.id },
          data: {
            cash_recorded_at: now,
            cash_recorded_by: posterUserId,
            status: PaymentStatus.CASH_RECORDED,
          },
        });
        if (assignment.job.status === JobStatus.COMPLETED) {
          await this.states.transitionInTransaction(
            transaction,
            assignment.job,
            JobStatus.PAYMENT_RECORDED,
            { type: JobActorType.POSTER, userId: posterUserId },
            "Job owner confirmed offline cash payment",
          );
        }
        await transaction.auditLog.create({
          data: {
            actor_user_id: posterUserId,
            action: "cash-payment.recorded",
            entity: "payment",
            entity_id: payment.id,
            before_json: { status: PaymentStatus.PENDING },
            after_json: {
              assignmentId,
              status: PaymentStatus.CASH_RECORDED,
            },
          },
        });
      }
      return { assignment, payment };
    });
    await this.notifications?.create({
      userId: result.assignment.worker_user_id,
      type: "CASH_PAYMENT_RECORDED",
      title: "Cash payment recorded",
      body: `${result.assignment.job.title} has been marked as paid in cash.`,
      payload: { assignmentId, route: "/assignments" },
      dedupeKey: `cash-payment:${result.payment.id}:recorded`,
    });
    return serializeHistory(
      {
        ...result.payment,
        assignment: { worker_user_id: result.assignment.worker_user_id },
        job: {
          title: result.assignment.job.title,
          currency: result.assignment.job.currency,
        },
      },
      posterUserId,
    );
  }

  async ensureCashPending(
    transaction: Prisma.TransactionClient,
    assignment: {
      id: string;
      job_id: string;
      worker_user_id: string;
      agreed_price_poisha: bigint;
      job: { poster_user_id: string };
    },
  ) {
    const existing = await transaction.payment.findUnique({
      where: { assignment_id: assignment.id },
    });
    if (existing) {
      if (
        existing.method === PaymentMethod.CASH_ON_COMPLETION &&
        existing.status === PaymentStatus.PENDING &&
        (existing.fee_poisha !== 0n ||
          existing.amount_poisha !== assignment.agreed_price_poisha ||
          existing.worker_earning_poisha !== assignment.agreed_price_poisha)
      ) {
        return transaction.payment.update({
          where: { id: existing.id },
          data: {
            agreed_amount_poisha: assignment.agreed_price_poisha,
            amount_poisha: assignment.agreed_price_poisha,
            fee_poisha: 0,
            worker_earning_poisha: assignment.agreed_price_poisha,
            fee_rule_key: "CASH_V1",
            fee_payer: "none",
          },
        });
      }
      return existing;
    }
    return transaction.payment.create({
      data: {
        job_id: assignment.job_id,
        assignment_id: assignment.id,
        payer_user_id: assignment.job.poster_user_id,
        agreed_amount_poisha: assignment.agreed_price_poisha,
        amount_poisha: assignment.agreed_price_poisha,
        fee_poisha: 0,
        worker_earning_poisha: assignment.agreed_price_poisha,
        fee_rule_key: "CASH_V1",
        fee_payer: "none",
        status: PaymentStatus.PENDING,
        method: PaymentMethod.CASH_ON_COMPLETION,
        idempotency_key: `cash-completion:${assignment.id}`,
      },
    });
  }

  async createIntent(
    actorUserId: string,
    assignmentId: string,
    idempotencyKey: string,
  ): Promise<PaymentIntentResponse> {
    const operation = `payment-intent:${assignmentId}`;
    const requestHash = createHash("sha256")
      .update(`${actorUserId}:${operation}`)
      .digest("hex");
    const cacheKey = `idempotency:${actorUserId}:${idempotencyKey}`;
    const cached = await this.readCache(cacheKey);
    if (cached) {
      if (cached.requestHash !== requestHash)
        throw new ConflictException(
          "This Idempotency-Key was already used for another request.",
        );
      return cached.response;
    }

    const response = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`${actorUserId}:${idempotencyKey}`}, 0))
      `;
      const previous = await transaction.idempotencyRecord.findUnique({
        where: {
          actor_user_id_key: {
            actor_user_id: actorUserId,
            key: idempotencyKey,
          },
        },
      });
      if (previous) {
        if (previous.request_hash !== requestHash)
          throw new ConflictException(
            "This Idempotency-Key was already used for another request.",
          );
        if (previous.response_json)
          return previous.response_json as unknown as PaymentIntentResponse;
      }

      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`payment-assignment:${assignmentId}`}, 0))
      `;

      const assignment = await transaction.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          contracts: { orderBy: { version: "desc" }, take: 1 },
          job: {
            select: { category_id: true, currency: true, poster_user_id: true },
          },
        },
      });
      if (!assignment || assignment.job.poster_user_id !== actorUserId)
        throw new NotFoundException("Assignment not found.");
      const contract = assignment.contracts[0];
      if (!contract)
        throw new ConflictException("Assignment contract is not available.");

      const existing = await transaction.payment.findUnique({
        where: { assignment_id: assignmentId },
      });
      const enabled = await this.paymentsEnabled(transaction);
      let result: PaymentIntentResponse;
      if (existing) {
        result = serializePayment(existing, assignment.job.currency, enabled);
      } else {
        const feeRule = enabled
          ? await this.resolveRule(transaction, {
              categoryId: assignment.job.category_id,
              userId: actorUserId,
            })
          : {
              feeBps: 0,
              minFeePoisha: 0n,
              maxFeePoisha: 0n,
              payer: "worker" as const,
              scopeKey: "CASH_V1",
            };
        const breakdown = calculateBreakdown(
          assignment.agreed_price_poisha,
          feeRule,
        );
        const payment = await transaction.payment.create({
          data: {
            job_id: assignment.job_id,
            assignment_id: assignment.id,
            payer_user_id: actorUserId,
            agreed_amount_poisha: breakdown.agreedPoisha,
            amount_poisha: breakdown.customerPaysPoisha,
            fee_poisha: breakdown.feePoisha,
            worker_earning_poisha: breakdown.workerReceivesPoisha,
            fee_rule_key: feeRule.scopeKey,
            fee_payer: enabled ? feeRule.payer : "none",
            status: PaymentStatus.PENDING,
            method: enabled
              ? PaymentMethod.MOBILE_FINANCIAL_SERVICE
              : PaymentMethod.CASH_ON_COMPLETION,
            idempotency_key: idempotencyKey,
          },
        });
        result = serializePayment(payment, assignment.job.currency, enabled);
        await transaction.auditLog.create({
          data: {
            actor_user_id: actorUserId,
            action: "payment.intent.created",
            entity: "payment",
            entity_id: payment.id,
            before_json: Prisma.JsonNull,
            after_json: result as unknown as Prisma.InputJsonValue,
          },
        });
      }

      const responseJson = result as unknown as Prisma.InputJsonValue;
      if (previous) {
        await transaction.idempotencyRecord.update({
          where: { id: previous.id },
          data: {
            response_json: responseJson,
            response_code: 201,
            completed_at: new Date(),
          },
        });
      } else {
        await transaction.idempotencyRecord.create({
          data: {
            actor_user_id: actorUserId,
            key: idempotencyKey,
            operation,
            request_hash: requestHash,
            response_json: responseJson,
            response_code: 201,
            completed_at: new Date(),
            expires_at: new Date(Date.now() + 24 * 60 * 60_000),
          },
        });
      }
      return result;
    });

    await this.writeCache(cacheKey, requestHash, response);
    return response;
  }

  private async paymentsEnabled(transaction: Prisma.TransactionClient) {
    const flag = await transaction.featureFlag.findUnique({
      where: { key: "payments_enabled" },
    });
    return (
      flag?.is_enabled === true &&
      flag.rollout_percent === 100 &&
      this.config.get<string>("PAYMENT_PROVIDER", "manual") !== "manual"
    );
  }

  private async resolveRule(
    transaction: Prisma.TransactionClient,
    input: { categoryId: string; userId: string },
  ) {
    const [user, rules, fallbackSetting] = await Promise.all([
      transaction.user.findUnique({
        where: { id: input.userId },
        select: { fee_tier: true },
      }),
      transaction.feeRule.findMany({ where: { is_active: true } }),
      transaction.configSetting.findUnique({ where: { key: "platform.fees" } }),
    ]);
    const fallbackJson = asRecord(fallbackSetting?.value_json);
    const fallback: FeeRuleValue = {
      feeBps:
        integer(fallbackJson?.feeBps) ??
        this.config.get<number>("PLATFORM_FEE_DEFAULT_BPS", 800),
      minFeePoisha: bigint(fallbackJson?.minFeePoisha) ?? 0n,
      maxFeePoisha: bigint(fallbackJson?.maxFeePoisha),
      payer: feePayer(fallbackJson?.payer),
      scopeKey: "GLOBAL:*",
    };
    const map = new Map<string, FeeRuleValue>(
      rules.map((rule) => [
        rule.scope_key,
        {
          feeBps: rule.fee_bps,
          minFeePoisha: rule.min_fee_poisha,
          maxFeePoisha: rule.max_fee_poisha,
          payer: feePayer(rule.payer),
          scopeKey: rule.scope_key,
        },
      ]),
    );
    return resolveFeeRule({
      categoryId: input.categoryId,
      global: fallback,
      rules: map,
      tier: user?.fee_tier,
      userId: input.userId,
    });
  }

  private async readCache(key: string) {
    try {
      const value = await this.redis.getClient().get(key);
      return value
        ? (JSON.parse(value) as {
            requestHash: string;
            response: PaymentIntentResponse;
          })
        : null;
    } catch {
      return null;
    }
  }

  private async writeCache(
    key: string,
    requestHash: string,
    response: PaymentIntentResponse,
  ) {
    try {
      await this.redis
        .getClient()
        .set(key, JSON.stringify({ requestHash, response }), "EX", 86_400);
    } catch {
      // PostgreSQL remains authoritative when Redis is temporarily unavailable.
    }
  }
}

function serializeHistory(
  payment: {
    id: string;
    assignment_id: string;
    agreed_amount_poisha: bigint;
    amount_poisha: bigint;
    fee_poisha: bigint;
    worker_earning_poisha: bigint;
    method: PaymentMethod;
    status: PaymentStatus;
    cash_recorded_at: Date | null;
    disputed_at: Date | null;
    created_at: Date;
    assignment: { worker_user_id: string };
    job: { title: string; currency: string };
  },
  userId: string,
) {
  return {
    id: payment.id,
    assignmentId: payment.assignment_id,
    jobTitle: payment.job.title,
    role: payment.assignment.worker_user_id === userId ? "WORKER" : "CUSTOMER",
    agreedPoisha: payment.agreed_amount_poisha.toString(),
    customerPaysPoisha: payment.amount_poisha.toString(),
    workerReceivesPoisha: payment.worker_earning_poisha.toString(),
    feePoisha: payment.fee_poisha.toString(),
    currency: payment.job.currency,
    method: payment.method,
    status: payment.status,
    cashRecordedAt: payment.cash_recorded_at?.toISOString() ?? null,
    disputedAt: payment.disputed_at?.toISOString() ?? null,
    createdAt: payment.created_at.toISOString(),
  };
}

function serializePayment(
  payment: {
    id: string;
    agreed_amount_poisha: bigint;
    amount_poisha: bigint;
    fee_poisha: bigint;
    worker_earning_poisha: bigint;
    fee_rule_key: string;
    fee_payer: string;
    method: PaymentMethod;
    status: PaymentStatus;
  },
  currency: string,
  enabled: boolean,
): PaymentIntentResponse {
  return {
    paymentId: payment.id,
    agreedPoisha: payment.agreed_amount_poisha.toString(),
    customerPaysPoisha: payment.amount_poisha.toString(),
    workerReceivesPoisha: payment.worker_earning_poisha.toString(),
    feePoisha: payment.fee_poisha.toString(),
    feePayer: feePayer(payment.fee_payer),
    feeRule: payment.fee_rule_key,
    currency,
    digitalPaymentsEnabled: enabled,
    method: payment.method,
    status: payment.status,
  };
}

function asRecord(value: Prisma.JsonValue | undefined) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

function bigint(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isSafeInteger(value))
    return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function feePayer(value: unknown): FeePayer {
  return value === "customer" || value === "split" ? value : "worker";
}

function maskPhone(phone: string | null) {
  if (!phone || phone.length < 6) return "Unavailable";
  return `${phone.slice(0, 6)}••••${phone.slice(-2)}`;
}

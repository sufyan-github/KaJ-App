import { createHash } from "node:crypto";

import {
  ConflictException,
  Injectable,
  NotFoundException,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

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
        const feeRule = await this.resolveRule(transaction, {
          categoryId: assignment.job.category_id,
          userId: actorUserId,
        });
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
            fee_payer: feeRule.payer,
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

import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { Observable, from, lastValueFrom } from "rxjs";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { KajHttpException } from "../errors/kaj-http.exception";
import { AuthenticatedRequest } from "../guards/jwt.guard";
import { CLOCK, Clock } from "../time/clock";

/**
 * R7 B4: an optional Idempotency-Key on booking and money POSTs. The first
 * successful answer for (person, key) is kept for a day; the same call again
 * gets that answer back instead of a second job, application or booking. The
 * same key with a different body or on another route is refused with
 * 409 IDEMPOTENCY_KEY_REUSED. A call that fails keeps nothing, so a corrected
 * retry may reuse the key. Calls without the header behave as before.
 *
 * Payments and attendance keep their own in-transaction records (the same
 * `idempotency_records` table and the same error).
 */
const IDEMPOTENT_METADATA = "kaj:idempotent";
const KEEP_MS = 24 * 60 * 60 * 1000;

/** Honours an Idempotency-Key on this route; `operation` names the route. */
export const Idempotent = (operation: string) =>
  SetMetadata(IDEMPOTENT_METADATA, operation);

export const idempotencyKeyReusedError = () =>
  new KajHttpException(
    {
      action: null,
      code: "IDEMPOTENCY_KEY_REUSED",
      details: [],
      field: null,
      message: "This Idempotency-Key was already used for a different request.",
      messageKey: "error.common.idempotency_key_reused",
      retryable: false,
    },
    HttpStatus.CONFLICT,
  );

const inProgressError = () =>
  new KajHttpException(
    {
      action: null,
      code: "IDEMPOTENCY_IN_PROGRESS",
      details: [],
      field: null,
      message: "The first request with this Idempotency-Key is still running.",
      messageKey: "error.common.idempotency_in_progress",
      retryable: true,
    },
    HttpStatus.CONFLICT,
  );

const invalidKeyError = () =>
  new KajHttpException(
    {
      action: null,
      code: "IDEMPOTENCY_KEY_INVALID",
      details: [],
      field: null,
      message: "The Idempotency-Key header must be 1-128 characters.",
      messageKey: "error.common.idempotency_key_invalid",
      retryable: false,
    },
    HttpStatus.BAD_REQUEST,
  );

/** A JSON text with sorted keys, so field order does not change the hash. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const operation = this.reflector.get<string | undefined>(
      IDEMPOTENT_METADATA,
      context.getHandler(),
    );
    if (!operation || context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<
      AuthenticatedRequest & {
        headers: Record<string, string | string[] | undefined>;
        params?: unknown;
        body?: unknown;
      }
    >();
    const header = request.headers["idempotency-key"];
    if (header === undefined || !request.auth) return next.handle();
    const key = (Array.isArray(header) ? header[0] : header)?.trim();
    if (!key || key.length > 128) throw invalidKeyError();
    const requestHash = createHash("sha256")
      .update(
        stableJson({ params: request.params ?? {}, body: request.body ?? {} }),
      )
      .digest("hex");
    return from(this.run(request.auth.sub, key, operation, requestHash, next));
  }

  private async run(
    actorUserId: string,
    key: string,
    operation: string,
    requestHash: string,
    next: CallHandler,
    attempt = 0,
  ): Promise<unknown> {
    const now = this.clock.now();
    const claimed = await this.claim(actorUserId, key, operation, requestHash);
    if (!claimed) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { actor_user_id_key: { actor_user_id: actorUserId, key } },
      });
      const again = () =>
        attempt < 2
          ? this.run(
              actorUserId,
              key,
              operation,
              requestHash,
              next,
              attempt + 1,
            )
          : Promise.reject(inProgressError());
      if (!existing) return again();
      if (existing.expires_at <= now) {
        await this.prisma.idempotencyRecord.deleteMany({
          where: { id: existing.id, expires_at: { lte: now } },
        });
        return again();
      }
      if (
        existing.operation !== operation ||
        existing.request_hash !== requestHash
      )
        throw idempotencyKeyReusedError();
      if (existing.completed_at) return existing.response_json;
      throw inProgressError();
    }
    let result: unknown;
    try {
      result = await lastValueFrom(next.handle(), { defaultValue: null });
    } catch (error) {
      // A failed call keeps nothing: the key may be used again.
      await this.prisma.idempotencyRecord.deleteMany({
        where: { actor_user_id: actorUserId, key, completed_at: null },
      });
      throw error;
    }
    const stored = JSON.parse(
      JSON.stringify(result ?? null, (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ) as Prisma.InputJsonValue;
    await this.prisma.idempotencyRecord.updateMany({
      where: { actor_user_id: actorUserId, key, completed_at: null },
      data: {
        response_json: stored ?? Prisma.JsonNull,
        response_code: 201,
        completed_at: this.clock.now(),
      },
    });
    return result;
  }

  /** Inserts the claim; false when (person, key) already has a record. */
  private async claim(
    actorUserId: string,
    key: string,
    operation: string,
    requestHash: string,
  ): Promise<boolean> {
    const expiresAt = new Date(this.clock.now().getTime() + KEEP_MS);
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO idempotency_records
        (actor_user_id, key, operation, request_hash, expires_at, updated_at)
      VALUES
        (${actorUserId}::uuid, ${key}, ${operation}, ${requestHash}, ${expiresAt}, now())
      ON CONFLICT (actor_user_id, key) DO NOTHING
    `;
    return inserted === 1;
  }
}

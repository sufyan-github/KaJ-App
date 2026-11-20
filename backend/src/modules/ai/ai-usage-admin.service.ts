import { Inject, Injectable } from "@nestjs/common";
import { AiFeature, Prisma } from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import { AiQuotaService } from "./ai-quota.service";
import { AiSettings } from "./ai.settings";

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

type DailyRow = {
  day: string;
  feature: AiFeature;
  calls: number;
  cost: bigint | number | null;
  input_tokens: bigint | number | null;
  output_tokens: bigint | number | null;
  refused: number;
  invalid: number;
  errors: number;
  model_fallbacks: number;
};
type UserRow = {
  user_id: string;
  display_name: string | null;
  calls: number;
  cost: bigint | number | null;
  refused: number;
};

const num = (value: bigint | number | null | undefined) => Number(value ?? 0);

/**
 * ADMIN view of ai_usage_logs: daily calls and estimated cost per feature,
 * top users by calls, refusals and fallbacks, and the configured caps.
 * Reads only; no prompt text is stored or shown.
 */
@Injectable()
export class AiUsageAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSettings,
    private readonly quota: AiQuotaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Start of the Asia/Dhaka day `days - 1` days before today, as UTC. */
  since(days: number): Date {
    const local = this.clock.now().getTime() + DHAKA_OFFSET_MS;
    const todayStart = Math.floor(local / 86_400_000) * 86_400_000;
    return new Date(todayStart - (days - 1) * 86_400_000 - DHAKA_OFFSET_MS);
  }

  async usage(days: number, actor: AdminActor, context: AdminRequestContext) {
    const since = this.since(days);
    const model = this.settings.model;
    const [daily, users, globalUsedToday] = await Promise.all([
      this.prisma.$queryRaw<DailyRow[]>`
        SELECT to_char(("created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD') AS day,
               "feature"::text AS feature,
               count(*)::int AS calls,
               sum("cost_usd_micros")::bigint AS cost,
               sum("input_tokens")::bigint AS input_tokens,
               sum("output_tokens")::bigint AS output_tokens,
               (count(*) FILTER (WHERE "outcome" = 'REFUSED'))::int AS refused,
               (count(*) FILTER (WHERE "outcome" = 'INVALID_OUTPUT'))::int AS invalid,
               (count(*) FILTER (WHERE "outcome" = 'ERROR'))::int AS errors,
               (count(*) FILTER (WHERE "outcome" <> 'ERROR' AND "model" <> ${model}))::int AS model_fallbacks
        FROM "ai_usage_logs"
        WHERE "created_at" >= ${since}
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2`,
      this.prisma.$queryRaw<UserRow[]>`
        SELECT l."user_id"::text AS user_id, p."display_name" AS display_name,
               count(*)::int AS calls,
               sum(l."cost_usd_micros")::bigint AS cost,
               (count(*) FILTER (WHERE l."outcome" = 'REFUSED'))::int AS refused
        FROM "ai_usage_logs" l
        LEFT JOIN "profiles" p ON p."user_id" = l."user_id"
        WHERE l."created_at" >= ${since} AND l."user_id" IS NOT NULL
        GROUP BY 1, 2
        ORDER BY calls DESC, cost DESC
        LIMIT 10`,
      this.quota.globalUsedToday(),
    ]);
    const rows = daily.map((row) => ({
      day: row.day,
      feature: row.feature,
      calls: row.calls,
      costUsdMicros: num(row.cost),
      inputTokens: num(row.input_tokens),
      outputTokens: num(row.output_tokens),
      refused: row.refused,
      invalidOutput: row.invalid,
      errors: row.errors,
      modelFallbacks: row.model_fallbacks,
    }));
    const sum = (key: keyof (typeof rows)[number]) =>
      rows.reduce((total, row) => total + Number(row[key]), 0);
    await this.prisma.auditLog.create({
      data: {
        actor_user_id: actor.userId,
        action: "ADMIN_AI_USAGE_VIEWED",
        entity: "AI_USAGE",
        entity_id: null,
        before_json: Prisma.JsonNull,
        after_json: { days },
        ip: context.ip,
        ua: context.ua,
      },
    });
    return {
      window: { days, since },
      settings: {
        enabled: this.settings.enabled,
        model,
        globalDailyLimit: this.settings.globalDailyLimit,
        globalUsedToday,
        resetsAt: this.quota.resetsAt(),
        perUserDailyLimits: Object.fromEntries(
          Object.values(AiFeature).map((feature) => [
            feature,
            this.settings.dailyLimit(feature),
          ]),
        ),
      },
      totals: {
        calls: sum("calls"),
        costUsdMicros: sum("costUsdMicros"),
        refused: sum("refused"),
        invalidOutput: sum("invalidOutput"),
        errors: sum("errors"),
        modelFallbacks: sum("modelFallbacks"),
      },
      daily: rows,
      topUsers: users.map((row) => ({
        userId: row.user_id,
        name: row.display_name,
        calls: row.calls,
        costUsdMicros: num(row.cost),
        refused: row.refused,
      })),
    };
  }
}

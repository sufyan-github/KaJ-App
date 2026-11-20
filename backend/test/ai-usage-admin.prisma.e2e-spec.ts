import "reflect-metadata";
import { AdminRole, RoleMode } from "@prisma/client";

import { RedisService } from "../src/infra/redis/redis.service";
import { AiSettings } from "../src/modules/ai/ai.settings";
import { adminSession } from "./support/admin-session";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.TRUST_DATABASE_E2E === "1" ? describe : describe.skip;

const DHAKA_OFFSET_MS = 6 * 3_600_000;
const dhakaDay = (date: Date) =>
  new Date(date.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);

/** ADMIN view of AI usage: daily cost per feature, top users, outcomes, cap. */
databaseDescribe("GET /admin/ai/usage", () => {
  let api: HttpHarness;
  let admin: Actor;
  let heavy: Actor;
  let light: Actor;
  let model: string;

  beforeAll(async () => {
    api = await HttpHarness.start();
    admin = await adminSession(api, AdminRole.ADMIN);
    heavy = await api.actor([RoleMode.BUSINESS], { displayName: "Heavy user" });
    light = await api.actor([RoleMode.WORKER], { displayName: "Light user" });
    model = api.app.get(AiSettings).model;
    // Totals are exact, so start from an empty table (test databases only).
    await api.db.aiUsageLog.deleteMany({});
    const today = new Date();
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
    const longAgo = new Date(Date.now() - 40 * 86_400_000);
    const row = (
      user: Actor,
      feature:
        "IDEA_ANALYSIS" | "OPPORTUNITY_SUGGESTIONS" | "BUSINESS_GROWTH_TIPS",
      outcome: "SUCCESS" | "REFUSED" | "INVALID_OUTPUT" | "ERROR",
      created_at: Date,
      extra: { model?: string; cost?: number } = {},
    ) => ({
      user_id: user.id,
      feature,
      outcome,
      model: extra.model ?? model,
      input_tokens: 1000,
      output_tokens: 200,
      cost_usd_micros: extra.cost ?? 4000,
      created_at,
    });
    await api.db.aiUsageLog.createMany({
      data: [
        row(heavy, "IDEA_ANALYSIS", "SUCCESS", today),
        row(heavy, "IDEA_ANALYSIS", "REFUSED", today, {
          model: "claude-sonnet-5",
        }),
        row(heavy, "OPPORTUNITY_SUGGESTIONS", "INVALID_OUTPUT", today),
        row(heavy, "BUSINESS_GROWTH_TIPS", "SUCCESS", threeDaysAgo),
        row(light, "OPPORTUNITY_SUGGESTIONS", "ERROR", threeDaysAgo, {
          cost: 0,
        }),
        row(light, "IDEA_ANALYSIS", "SUCCESS", longAgo),
      ],
    });
    const day = dhakaDay(today);
    await api.app
      .get(RedisService)
      .getClient()
      .set(`ai:quota:global:${day}`, "7", "EX", 600);
  });

  afterAll(async () => {
    await api.db.aiUsageLog.deleteMany({
      where: { user_id: { in: [heavy.id, light.id] } },
    });
    await api.db.auditLog.deleteMany({ where: { actor_user_id: admin.id } });
    await api?.close();
  });

  it("sums calls, cost and outcomes per Dhaka day and feature", async () => {
    const response = await api.get("admin/ai/usage?days=7", admin);
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.totals).toEqual({
      calls: 5,
      costUsdMicros: 16_000,
      refused: 1,
      invalidOutput: 1,
      errors: 1,
      modelFallbacks: 1,
    });
    const today = dhakaDay(new Date());
    expect(data.daily).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          day: today,
          feature: "IDEA_ANALYSIS",
          calls: 2,
          costUsdMicros: 8000,
          refused: 1,
          modelFallbacks: 1,
        }),
      ]),
    );
    // The 40-day-old row is outside a 7-day window.
    const first = dhakaDay(new Date(data.window.since));
    expect(
      data.daily.filter((row: { day: string }) => row.day < first),
    ).toEqual([]);
  });

  it("ranks users by calls", async () => {
    const response = await api.get("admin/ai/usage?days=7", admin);
    expect(response.body.data.topUsers.slice(0, 2)).toEqual([
      expect.objectContaining({
        userId: heavy.id,
        name: "Heavy user",
        calls: 4,
        refused: 1,
      }),
      expect.objectContaining({ userId: light.id, calls: 1 }),
    ]);
  });

  it("shows the global daily cap and today's count", async () => {
    const { settings } = (await api.get("admin/ai/usage", admin)).body.data;
    expect(settings).toMatchObject({
      model,
      globalDailyLimit: api.app.get(AiSettings).globalDailyLimit,
      globalUsedToday: 7,
    });
    expect(Object.keys(settings.perUserDailyLimits).sort()).toEqual([
      "BUSINESS_GROWTH_TIPS",
      "IDEA_ANALYSIS",
      "OPPORTUNITY_SUGGESTIONS",
    ]);
  });

  it("is ADMIN only and validates the window", async () => {
    for (const role of [
      AdminRole.MODERATOR,
      AdminRole.SUPPORT,
      AdminRole.FINANCE,
    ]) {
      const other = await adminSession(api, role);
      expect((await api.get("admin/ai/usage", other)).status).toBe(403);
    }
    expect((await api.get("admin/ai/usage")).status).toBe(401);
    expect((await api.get("admin/ai/usage?days=0", admin)).status).toBe(400);
    expect((await api.get("admin/ai/usage?days=91", admin)).status).toBe(400);
  });
});

import { RoleMode, SubscriptionStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { AiUpstreamError, emptyUsage } from "../src/modules/ai/ai-client";
import { AI_CLIENT } from "../src/modules/ai/ai-client";
import { AiSettings } from "../src/modules/ai/ai.settings";
import {
  GROWTH_TIPS_SYSTEM,
  IDEA_ANALYSIS_SYSTEM,
  OPPORTUNITY_RANKING_SYSTEM,
} from "../src/modules/ai/ai.prompts";
import {
  configOf,
  FakeAiClient,
  validIdeaAnalysis,
} from "./support/ai-fixtures";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** AiSettings with a switchable flag (the real class reads the env once). */
class TestAiSettings extends AiSettings {
  on = true;
  override get enabled() {
    return this.on;
  }
}

const RUN = randomUUID().slice(0, 8);
const OWNER_NAME = "Abdul Karim Secretname";
const BLOCKED_JOB = `Blocked poster job ${RUN}`;
const POSTER_NAME = "Poster Hiddenname";
const PHONE = "01712345678";
const EMAIL = "abdul.karim@example.com";

const growthTips = {
  summary: "Strong local demand; packaging is the gap.",
  tips: [1, 2, 3].map((n) => ({
    title: `Tip ${n}`,
    detail: "Do one concrete thing this week.",
    area: "MARKETING",
    effort: "LOW",
    costBdt: { min: 0, max: 500 },
    kaajAction: "LIST_OFFERING",
  })),
};

/**
 * P4 AI over real HTTP with a fake AiClient (no network): flag, consent,
 * subscriber gate, quota, redaction, retrieval-only ranking, refusal
 * fallbacks, stored analysis and usage logging.
 */
databaseDescribe("AI opportunity intelligence (real HTTP, fake model)", () => {
  let api: HttpHarness;
  const fake = new FakeAiClient();
  const settings = new TestAiSettings(
    configOf({
      AI_ENABLED: "true",
      ANTHROPIC_API_KEY: "test-key-not-used",
      AI_DAILY_LIMIT_IDEA_ANALYSIS: "3",
      AI_DAILY_LIMIT_SUGGESTIONS: "5",
      AI_DAILY_LIMIT_GROWTH_TIPS: "2",
      AI_GLOBAL_DAILY_LIMIT: "100000",
    }),
  );
  let owner: Actor;
  let stranger: Actor;
  let poster: Actor;
  let blockedPoster: Actor;
  let locationId: string;
  let sectorId: string;
  let ideaId: string;
  let businessId: string;
  let openJobId: string;
  let blockedJobId: string;
  let groupId: string;

  /** Answers per feature, like the real model would. */
  const answerEverything = () => {
    fake.respond = (request) => {
      const usage = {
        ...emptyUsage("claude-sonnet-5-5", 900),
        stopReason: "end_turn",
        inputTokens: 1_000,
        outputTokens: 1_500,
        cacheReadInputTokens: 1_200,
      };
      if (request.system === IDEA_ANALYSIS_SYSTEM)
        return { outcome: "SUCCESS", data: validIdeaAnalysis(), usage };
      if (request.system === GROWTH_TIPS_SYSTEM)
        return { outcome: "SUCCESS", data: growthTips, usage };
      // The first three of each kind (the schema allows 20 items).
      const refs = [...request.prompt.matchAll(/"ref": "([JLMG][1-3])"/g)].map(
        (match) => match[1]!,
      );
      return {
        outcome: "SUCCESS",
        data: {
          summary: "Start with the nearby job.",
          items: [
            { ref: "J99", score: 99, reason: "Invented by the model." },
            ...refs.map((ref, index) => ({
              ref,
              score: 90 - index,
              reason: `Fits you (${ref}).`,
            })),
            { ref: refs[0] ?? "J1", score: 10, reason: "Repeated." },
          ],
        },
        usage,
      };
    };
  };
  const consent = (as: Actor) =>
    api.post("ai/consent", as, { version: 1 }).expect(201);
  const subscribe = async (userId: string) => {
    const plan = await api.db.subscriptionPlan.create({
      data: {
        code: `ai-test-${randomUUID().slice(0, 8)}`,
        name_en: "AI test plan",
        name_bn: "এআই পরীক্ষা",
        price_poisha: 100n,
        duration_days: 30,
        feature_keys: [],
      },
    });
    await api.db.subscription.create({
      data: {
        user_id: userId,
        plan_id: plan.id,
        status: SubscriptionStatus.ACTIVE,
        starts_at: new Date(Date.now() - 86_400_000),
        expires_at: new Date(Date.now() + 10 * 86_400_000),
      },
    });
  };

  beforeAll(async () => {
    api = await HttpHarness.start((builder) =>
      builder
        .overrideProvider(AI_CLIENT)
        .useValue(fake)
        .overrideProvider(AiSettings)
        .useValue(settings),
    );
    locationId = (
      await api.db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
    sectorId = (
      await api.db.businessCategory.findUniqueOrThrow({
        where: { slug: "agriculture" },
      })
    ).id;
    owner = await api.actor([RoleMode.CUSTOMER, RoleMode.WORKER], {
      displayName: OWNER_NAME,
      profile: { locale: "en", primary_location_id: locationId },
    });
    stranger = await api.actor([RoleMode.CUSTOMER]);
    poster = await api.actor([RoleMode.CUSTOMER], { displayName: POSTER_NAME });
    blockedPoster = await api.actor([RoleMode.CUSTOMER], {
      displayName: "Blocked Person",
    });
    openJobId = await api.openJob(poster, {
      title: "Mango sorting helper",
      locationId,
    });
    blockedJobId = await api.openJob(blockedPoster, {
      title: BLOCKED_JOB,
      locationId,
    });
    await api.db.userBlock.create({
      data: { blocker_user_id: owner.id, blocked_user_id: blockedPoster.id },
    });
    groupId = (
      await api.db.communityGroup.create({
        data: {
          created_by_user_id: poster.id,
          name: "Rajshahi mango growers",
          description: `Weekly price talk. Admin ${PHONE}.`,
          location_id: locationId,
        },
      })
    ).id;
    ideaId = (
      await api
        .post("ideas", owner, {
          title: "Shared cold room for mango farmers",
          summary: "A shared cold room so farmers sell later at better prices.",
          problem: "Mango farmers lose a third of the harvest to rot.",
          solution: `Solar cold room booked by SMS. Call me on ${PHONE} or ${EMAIL}.`,
          details: "Site at House 12, Road 5, Shibganj. NID 1990123456789.",
          categoryId: sectorId,
        })
        .expect(201)
    ).body.data.id;
    businessId = (
      await api
        .post("businesses", owner, {
          name: "Karim Secret Foods",
          stage: "INFORMAL",
          description: `Home-made pickles. Orders: ${PHONE}.`,
          address: "House 9, Road 2, Upashahar",
          contactPerson: OWNER_NAME,
          tradeLicenceNo: "TL-77-SECRET",
        })
        .expect(201)
    ).body.data.id;
    answerEverything();
  });

  afterEach(() => {
    settings.on = true;
    answerEverything();
  });

  afterAll(async () => {
    await api?.close();
  });

  it("FLAG: with AI off the status says so and every AI route is 503 AI_DISABLED", async () => {
    settings.on = false;
    const status = await api.get("ai/status", owner).expect(200);
    expect(status.body.data).toMatchObject({
      enabled: false,
      consent: { required: true, currentVersion: 1, accepted: false },
    });
    for (const call of [
      () => api.post("ai/opportunity-suggestions", owner),
      () => api.post(`ideas/${ideaId}/ai-analysis`, owner),
      () => api.post(`businesses/${businessId}/ai-growth-tips`, owner),
    ]) {
      const response = await call().expect(503);
      expect(response.body.error.code).toBe("AI_DISABLED");
    }
    // The stored analysis still reads with AI off (no model call).
    await api.get(`ideas/${ideaId}/ai-analysis`, owner).expect(200);
    expect(fake.requests).toHaveLength(0);
  });

  it("CONSENT: nothing is sent before opt-in; the opt-in is versioned, audited and revocable", async () => {
    const refused = await api
      .post("ai/opportunity-suggestions", owner)
      .expect(403);
    expect(refused.body.error).toMatchObject({
      code: "AI_CONSENT_REQUIRED",
      details: [{ currentVersion: 1 }],
    });
    const wrongVersion = await api
      .post("ai/consent", owner, { version: 2 })
      .expect(400);
    expect(wrongVersion.body.error.code).toBe("AI_CONSENT_VERSION_MISMATCH");
    expect(fake.requests).toHaveLength(0);

    const accepted = await consent(owner);
    expect(accepted.body.data).toMatchObject({
      accepted: true,
      acceptedVersion: 1,
      acceptedAt: expect.any(String),
    });
    const row = await api.db.aiConsent.findUniqueOrThrow({
      where: { user_id: owner.id },
    });
    expect(row).toMatchObject({ version: 1, withdrawn_at: null });
    expect(
      await api.db.auditLog.count({
        where: { actor_user_id: owner.id, action: "ai.consent.accepted" },
      }),
    ).toBe(1);

    const withdrawn = await api.delete("ai/consent", owner).expect(200);
    expect(withdrawn.body.data.accepted).toBe(false);
    await api.post("ai/opportunity-suggestions", owner).expect(403);
    await consent(owner);
  });

  it("IDEA: owner only (404), idea consent (409), subscribers only (403) even before the paywall launches", async () => {
    await consent(stranger);
    await api.post(`ideas/${ideaId}/ai-analysis`, stranger).expect(404);
    await api.get(`ideas/${ideaId}/ai-analysis`, stranger).expect(404);

    const noIdeaConsent = await api
      .post(`ideas/${ideaId}/ai-analysis`, owner)
      .expect(409);
    expect(noIdeaConsent.body.error.code).toBe("AI_IDEA_CONSENT_REQUIRED");
    await api.patch(`ideas/${ideaId}`, owner, { aiConsent: true }).expect(200);

    // subscriptions_enabled is off in tests: everything else is free, AI
    // idea analysis still needs an active subscription.
    const status = await api.get("ai/status", owner).expect(200);
    expect(status.body.data.features.IDEA_ANALYSIS).toMatchObject({
      requiresSubscription: true,
      subscriptionActive: false,
    });
    const unpaid = await api
      .post(`ideas/${ideaId}/ai-analysis`, owner)
      .expect(403);
    expect(unpaid.body.error.code).toBe("SUBSCRIPTION_REQUIRED");
    expect(fake.requests).toHaveLength(0);
  });

  it("IDEA: a subscriber gets a validated analysis, stored on the idea and logged with cost; the prompt is redacted", async () => {
    await subscribe(owner.id);
    const response = await api
      .post(`ideas/${ideaId}/ai-analysis`, owner, {})
      .expect(201);
    expect(response.body.data).toMatchObject({
      ideaId,
      locale: "en",
      model: "claude-sonnet-5-5",
      analysis: { feasibility: { rating: "MEDIUM" } },
    });

    const prompt = fake.lastPrompt();
    expect(prompt).toContain("Write every text value in English.");
    expect(prompt).toContain("Solar cold room booked by SMS");
    for (const secret of [
      PHONE,
      EMAIL,
      "1990123456789",
      "House 12",
      OWNER_NAME,
    ])
      expect(prompt).not.toContain(secret);
    expect(prompt).toContain("[PHONE]");
    expect(prompt).toContain("[EMAIL]");

    const stored = await api
      .get(`ideas/${ideaId}/ai-analysis`, owner)
      .expect(200);
    expect(stored.body.data).toEqual(response.body.data);
    const log = await api.db.aiUsageLog.findFirstOrThrow({
      where: { user_id: owner.id, feature: "IDEA_ANALYSIS" },
      orderBy: { created_at: "desc" },
    });
    expect(log).toMatchObject({
      outcome: "SUCCESS",
      subject_id: ideaId,
      input_tokens: 1_000,
      output_tokens: 1_500,
      cache_read_input_tokens: 1_200,
      // 1000×2 + 1500×10 + 1200×0.1 micro-dollars
      cost_usd_micros: 17_120,
    });
  });

  it("IDEA: Bangla on request", async () => {
    await api
      .post(`ideas/${ideaId}/ai-analysis`, owner, { locale: "bn" })
      .expect(201);
    expect(fake.lastPrompt()).toContain("Bangla (Bengali script)");
    await api
      .post(`ideas/${ideaId}/ai-analysis`, owner, { locale: "fr" })
      .expect(400);
  });

  it("REFUSAL: idea analysis answers 422 AI_DECLINED and keeps the stored analysis", async () => {
    const before = await api
      .get(`ideas/${ideaId}/ai-analysis`, owner)
      .expect(200);
    fake.refuse();
    const declined = await api
      .post(`ideas/${ideaId}/ai-analysis`, owner)
      .expect(422);
    expect(declined.body.error.code).toBe("AI_DECLINED");
    const after = await api
      .get(`ideas/${ideaId}/ai-analysis`, owner)
      .expect(200);
    expect(after.body.data).toEqual(before.body.data);
    expect(
      await api.db.aiUsageLog.count({
        where: { user_id: owner.id, outcome: "REFUSED" },
      }),
    ).toBeGreaterThan(0);
  });

  it("QUOTA: idea analysis stops at the daily limit with 429 and Retry-After", async () => {
    // Three calls today already (two successes, one refusal); limit is 3.
    const limited = await api
      .post(`ideas/${ideaId}/ai-analysis`, owner)
      .expect(429);
    expect(limited.body.error).toMatchObject({
      code: "AI_QUOTA_EXCEEDED",
      details: [{ limit: 3 }],
    });
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    const status = await api.get("ai/status", owner).expect(200);
    expect(status.body.data.features.IDEA_ANALYSIS).toMatchObject({
      dailyLimit: 3,
      usedToday: 3,
      remainingToday: 0,
    });
  });

  it("SUGGESTIONS: the model only ranks what the server retrieved; blocks, invented refs and names stay out", async () => {
    const response = await api
      .post("ai/opportunity-suggestions", owner, {})
      .expect(201);
    const { data } = response.body;
    expect(data.source).toBe("AI");
    expect(data.summary).toBe("Start with the nearby job.");
    const ids = data.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(openJobId);
    expect(ids).toContain(groupId);
    expect(ids).not.toContain(blockedJobId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(data.items[0]).toMatchObject({
      type: expect.stringMatching(/JOB|LEARNING|MENTOR|GROUP/),
      title: expect.any(String),
      score: expect.any(Number),
      reason: expect.stringContaining("Fits you"),
    });

    const prompt = fake.lastPrompt();
    expect(prompt).toContain("Mango sorting helper");
    for (const secret of [
      POSTER_NAME,
      OWNER_NAME,
      BLOCKED_JOB,
      PHONE,
      openJobId,
      poster.id,
    ])
      expect(prompt).not.toContain(secret);
  });

  it("SUGGESTIONS: a refusal or an invalid answer falls back to the server's own order", async () => {
    fake.refuse();
    const refused = await api
      .post("ai/opportunity-suggestions", owner)
      .expect(201);
    expect(refused.body.data).toMatchObject({
      source: "FALLBACK",
      summary: null,
    });
    expect(refused.body.data.items.length).toBeGreaterThan(0);
    expect(refused.body.data.items[0]).toMatchObject({
      score: null,
      reason: null,
    });

    fake.succeed({
      summary: "ok",
      items: [{ ref: "J1", score: 500, reason: "" }],
    });
    const invalid = await api
      .post("ai/opportunity-suggestions", owner, { types: ["JOB"] })
      .expect(201);
    expect(invalid.body.data.source).toBe("FALLBACK");
    expect(
      await api.db.aiUsageLog.count({
        where: { user_id: owner.id, outcome: "INVALID_OUTPUT" },
      }),
    ).toBe(1);
  });

  it("GROWTH TIPS: members only; no name, address, licence or contact is sent; refusal gives the standard tips", async () => {
    await api
      .post(`businesses/${businessId}/ai-growth-tips`, stranger)
      .expect(404);
    const response = await api
      .post(`businesses/${businessId}/ai-growth-tips`, owner, { locale: "bn" })
      .expect(201);
    expect(response.body.data).toMatchObject({
      businessId,
      source: "AI",
      locale: "bn",
      tips: growthTips.tips,
    });
    const prompt = fake.lastPrompt();
    expect(prompt).toContain("Home-made pickles");
    for (const secret of [
      "Karim Secret Foods",
      "Upashahar",
      "TL-77-SECRET",
      OWNER_NAME,
      PHONE,
    ])
      expect(prompt).not.toContain(secret);

    fake.refuse();
    const fallback = await api
      .post(`businesses/${businessId}/ai-growth-tips`, owner)
      .expect(201);
    expect(fallback.body.data).toMatchObject({
      source: "FALLBACK",
      locale: "en",
    });
    expect(fallback.body.data.tips.length).toBeGreaterThanOrEqual(3);

    // Limit 2 reached.
    const limited = await api
      .post(`businesses/${businessId}/ai-growth-tips`, owner)
      .expect(429);
    expect(limited.body.error.code).toBe("AI_QUOTA_EXCEEDED");
  });

  it("UPSTREAM: a provider failure is 503 AI_UNAVAILABLE and doesn't use quota", async () => {
    const user = await api.actor([RoleMode.WORKER], {
      profile: { primary_location_id: locationId },
    });
    await consent(user);
    fake.respond = () => new AiUpstreamError("timeout");
    const failed = await api
      .post("ai/opportunity-suggestions", user)
      .expect(503);
    expect(failed.body.error).toMatchObject({
      code: "AI_UNAVAILABLE",
      retryable: true,
    });
    const status = await api.get("ai/status", user).expect(200);
    expect(status.body.data.features.OPPORTUNITY_SUGGESTIONS.usedToday).toBe(0);
    expect(
      await api.db.aiUsageLog.count({
        where: { user_id: user.id, outcome: "ERROR" },
      }),
    ).toBe(1);
  });
});

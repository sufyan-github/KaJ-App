import Anthropic from "@anthropic-ai/sdk";
import { AiFeature } from "@prisma/client";

import { describeException } from "../src/common/filters/http-exception.filter";
import { RateLimitException } from "../src/common/errors/rate-limit.exception";
import {
  AiClient,
  AiUpstreamError,
  costUsdMicros,
  emptyUsage,
} from "../src/modules/ai/ai-client";
import { AiQuotaService, QuotaStore } from "../src/modules/ai/ai-quota.service";
import { AiRunnerService } from "../src/modules/ai/ai-runner.service";
import { AiSettings } from "../src/modules/ai/ai.settings";
import {
  GROWTH_TIPS_SYSTEM,
  IDEA_ANALYSIS_SYSTEM,
  OPPORTUNITY_RANKING_SYSTEM,
  userTurn,
} from "../src/modules/ai/ai.prompts";
import {
  growthTipsSchema,
  ideaAnalysisSchema,
  opportunityRankingSchema,
} from "../src/modules/ai/ai.schemas";
import { AnthropicAiClient } from "../src/modules/ai/anthropic-ai.client";
import { redact } from "../src/modules/ai/redaction";
import { configOf, validIdeaAnalysis } from "./support/ai-fixtures";

const settings = (env: Record<string, string> = {}) =>
  new AiSettings(
    configOf({
      AI_ENABLED: "true",
      ANTHROPIC_API_KEY: "sk-ant-test-not-a-real-key",
      ...env,
    }),
  );

const codeOf = (error: unknown) => describeException(error).descriptor.code;
const statusOf = (error: unknown) => describeException(error).status;

describe("AI redaction (P4 privacy)", () => {
  it.each([
    ["Call 01712-345678 or +8801812345678", "Call [PHONE] or [PHONE]"],
    ["নম্বর ০১৭১২৩৪৫৬৭৮ এ ফোন দিন", "নম্বর [PHONE] এ ফোন দিন"],
    ["bKash 0088 01912 345 678", "bKash [PHONE]"],
    ["mail rahim.k+shop@gmail.com now", "mail [EMAIL] now"],
    ["NID: 1990123456", "[NID]"],
    ["এনআইডি নং ১৯৯০১২৩৪৫৬৭৮৯০১২৩", "[NID]"],
    ["birth reg 19901234567890123", "birth reg [ID_NUMBER]"],
    ["House 12, Road no. 5/A, Dhanmondi", "[ADDRESS], [ADDRESS], Dhanmondi"],
    [
      "বাড়ি নং ১২, ১২ নং রোড, শাহেব বাজার",
      "[ADDRESS], [ADDRESS], শাহেব বাজার",
    ],
    ["Rajshahi-6000", "Rajshahi [ADDRESS]"],
    ["post code 6203", "[ADDRESS]"],
    ["shop at 24.3745, 88.6042", "shop at [LOCATION]"],
  ])("redacts %p", (input, expected) => {
    expect(redact(input).text).toBe(expected);
  });

  it("keeps money, years, counts and area names", () => {
    const text =
      "Cost 4,20,000 taka (4.2 lakh) in 2026; 3 workers; prices 10 15 20; Boalia, Rajshahi";
    expect(redact(text)).toEqual({ text, redactions: 0 });
  });
});

describe("AI output schemas (server-side validation)", () => {
  it("accepts a complete idea analysis", () => {
    expect(ideaAnalysisSchema.safeParse(validIdeaAnalysis()).success).toBe(
      true,
    );
  });

  it("rejects a cost range whose minimum exceeds its maximum", () => {
    const analysis = validIdeaAnalysis();
    analysis.startupCostsBdt.totalMinBdt = 900_000;
    analysis.startupCostsBdt.totalMaxBdt = 100_000;
    expect(ideaAnalysisSchema.safeParse(analysis).success).toBe(false);
  });

  it("rejects unknown ratings, too many risks and empty text", () => {
    const badRating = {
      ...validIdeaAnalysis(),
      feasibility: { rating: "GREAT", explanation: "x" },
    };
    const tooMany = validIdeaAnalysis();
    tooMany.risks = Array.from({ length: 7 }, () => tooMany.risks[0]!);
    const empty = { ...validIdeaAnalysis(), summary: "   " };
    for (const value of [badRating, tooMany, empty])
      expect(ideaAnalysisSchema.safeParse(value).success).toBe(false);
  });

  it("checks rankings and growth tips", () => {
    expect(
      opportunityRankingSchema.safeParse({
        summary: "Two good fits.",
        items: [{ ref: "J1", score: 101, reason: "Too sure." }],
      }).success,
    ).toBe(false);
    expect(
      growthTipsSchema.safeParse({ summary: "Short.", tips: [] }).success,
    ).toBe(false);
  });
});

describe("AI prompts (caching and locale)", () => {
  it("keeps system prompts static and long enough to cache", () => {
    for (const system of [
      IDEA_ANALYSIS_SYSTEM,
      OPPORTUNITY_RANKING_SYSTEM,
      GROWTH_TIPS_SYSTEM,
    ]) {
      // > 512 tokens (Sonnet 5.5 minimum cacheable prefix) ≈ 4 chars/token.
      expect(system.length).toBeGreaterThan(3_000);
      expect(system).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it("puts the output language in the user turn", () => {
    expect(userTurn("bn", "Task.", { idea: {} })).toContain("Bangla");
    expect(userTurn("en", "Task.", { idea: {} })).toContain("in English");
  });
});

describe("AiSettings (feature flag)", () => {
  it("is off by default, off without a key, on with both", () => {
    expect(new AiSettings(configOf({})).enabled).toBe(false);
    expect(settings({ ANTHROPIC_API_KEY: "" }).enabled).toBe(false);
    expect(settings({ AI_ENABLED: "false" }).enabled).toBe(false);
    expect(settings().enabled).toBe(true);
    expect(settings().model).toBe("claude-sonnet-5-5");
  });
});

describe("AnthropicAiClient (fake SDK: no network)", () => {
  const message = (overrides: Record<string, unknown> = {}) => ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    stop_reason: "end_turn",
    stop_details: null,
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: JSON.stringify(validIdeaAnalysis()) },
    ],
    usage: {
      input_tokens: 900,
      output_tokens: 2_000,
      cache_read_input_tokens: 1_200,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  });
  const clientWith = (create: jest.Mock) =>
    new AnthropicAiClient(settings(), {
      beta: { messages: { create } },
    } as unknown as Anthropic);
  const request = {
    system: IDEA_ANALYSIS_SYSTEM,
    prompt: "Analyse.",
    schema: ideaAnalysisSchema,
    effort: "medium" as const,
    maxTokens: 16_000,
  };

  it("sends a cached system prompt, a JSON schema, effort and the fallback", async () => {
    const create = jest.fn().mockResolvedValue(message());
    const result = await clientWith(create).generate(request);
    expect(result.outcome).toBe("SUCCESS");
    const params = create.mock.calls[0][0];
    expect(params).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 16_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        {
          type: "text",
          text: IDEA_ANALYSIS_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: { effort: "medium", format: { type: "json_schema" } },
    });
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("tool_choice");
    expect(result.usage).toEqual({
      model: "claude-sonnet-5-5",
      stopReason: "end_turn",
      inputTokens: 900,
      outputTokens: 2_000,
      cacheReadInputTokens: 1_200,
      cacheCreationInputTokens: 0,
      latencyMs: expect.any(Number),
    });
  });

  it("checks stop_reason before reading content: refusal", async () => {
    const create = jest.fn().mockResolvedValue(
      message({
        stop_reason: "refusal",
        stop_details: {
          type: "refusal",
          category: "general_harms",
          explanation: null,
        },
        content: [],
      }),
    );
    await expect(clientWith(create).generate(request)).resolves.toMatchObject({
      outcome: "REFUSED",
      data: null,
      detail: "general_harms",
    });
  });

  it("never trusts truncated or malformed output", async () => {
    const truncated = jest
      .fn()
      .mockResolvedValue(message({ stop_reason: "max_tokens" }));
    await expect(
      clientWith(truncated).generate(request),
    ).resolves.toMatchObject({
      outcome: "INVALID_OUTPUT",
    });
    const malformed = jest
      .fn()
      .mockResolvedValue(
        message({ content: [{ type: "text", text: '{"summary": ' }] }),
      );
    await expect(
      clientWith(malformed).generate(request),
    ).resolves.toMatchObject({
      outcome: "INVALID_OUTPUT",
      detail: "json",
    });
  });

  it("maps provider failures to AiUpstreamError", async () => {
    const create = jest
      .fn()
      .mockRejectedValue(new Anthropic.APIConnectionTimeoutError());
    await expect(clientWith(create).generate(request)).rejects.toBeInstanceOf(
      AiUpstreamError,
    );
  });
});

describe("cost logging", () => {
  it("prices Sonnet 5.5 tokens in micro-dollars", () => {
    expect(
      costUsdMicros({
        ...emptyUsage("claude-sonnet-5-5"),
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheReadInputTokens: 1_000_000,
        cacheCreationInputTokens: 0,
      }),
    ).toBe(2_000_000 + 1_000_000 + 100_000);
  });
});

/** In-memory Redis for the quota. */
class MemoryStore implements QuotaStore {
  readonly values = new Map<string, number>();
  failing = false;
  async incr(key: string) {
    if (this.failing) throw new Error("redis down");
    const next = (this.values.get(key) ?? 0) + 1;
    this.values.set(key, next);
    return next;
  }
  async decr(key: string) {
    const next = (this.values.get(key) ?? 0) - 1;
    this.values.set(key, next);
    return next;
  }
  async expire() {
    return 1;
  }
  async get(key: string) {
    if (this.failing) throw new Error("redis down");
    const value = this.values.get(key);
    return value === undefined ? null : String(value);
  }
}

class TestQuota extends AiQuotaService {
  constructor(
    readonly memory: MemoryStore,
    aiSettings: AiSettings,
    now = new Date("2026-11-20T17:30:00Z"), // 23:30 in Dhaka
  ) {
    super({} as never, aiSettings, { now: () => now });
  }
  protected override store() {
    return this.memory;
  }
}

describe("AI daily quota", () => {
  it("allows the daily limit, then 429 AI_QUOTA_EXCEEDED until Dhaka midnight", async () => {
    const quota = new TestQuota(
      new MemoryStore(),
      settings({ AI_DAILY_LIMIT_SUGGESTIONS: "2" }),
    );
    await quota.claim("user-1", AiFeature.OPPORTUNITY_SUGGESTIONS);
    await quota.claim("user-1", AiFeature.OPPORTUNITY_SUGGESTIONS);
    const refused = await quota
      .claim("user-1", AiFeature.OPPORTUNITY_SUGGESTIONS)
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(RateLimitException);
    expect(codeOf(refused)).toBe("AI_QUOTA_EXCEEDED");
    expect(statusOf(refused)).toBe(429);
    // 23:30 Dhaka → reset in 30 minutes.
    expect((refused as RateLimitException).retryAfterSeconds).toBe(1_800);
    expect(quota.resetsAt().toISOString()).toBe("2026-11-20T18:00:00.000Z");
    // Other users and features are counted separately.
    await quota.claim("user-2", AiFeature.OPPORTUNITY_SUGGESTIONS);
    await quota.claim("user-1", AiFeature.BUSINESS_GROWTH_TIPS);
    expect(await quota.usage("user-1")).toEqual({
      IDEA_ANALYSIS: 0,
      OPPORTUNITY_SUGGESTIONS: 2,
      BUSINESS_GROWTH_TIPS: 1,
    });
  });

  it("gives the slot back on release (provider failure)", async () => {
    const quota = new TestQuota(
      new MemoryStore(),
      settings({ AI_DAILY_LIMIT_IDEA_ANALYSIS: "1" }),
    );
    const ticket = await quota.claim("user-1", AiFeature.IDEA_ANALYSIS);
    await ticket.release();
    await ticket.release(); // idempotent
    await expect(
      quota.claim("user-1", AiFeature.IDEA_ANALYSIS),
    ).resolves.toBeDefined();
  });

  it("stops everyone at the global daily backstop (503, not 429)", async () => {
    const quota = new TestQuota(
      new MemoryStore(),
      settings({ AI_GLOBAL_DAILY_LIMIT: "1" }),
    );
    await quota.claim("user-1", AiFeature.OPPORTUNITY_SUGGESTIONS);
    const refused = await quota
      .claim("user-2", AiFeature.OPPORTUNITY_SUGGESTIONS)
      .catch((error: unknown) => error);
    expect(codeOf(refused)).toBe("AI_UNAVAILABLE");
    expect(
      quota.memory.values.get(
        "ai:quota:OPPORTUNITY_SUGGESTIONS:user-2:2026-11-20",
      ),
    ).toBe(0);
  });

  it("fails closed when Redis is down", async () => {
    const memory = new MemoryStore();
    memory.failing = true;
    const quota = new TestQuota(memory, settings());
    const refused = await quota
      .claim("user-1", AiFeature.IDEA_ANALYSIS)
      .catch((error: unknown) => error);
    expect(codeOf(refused)).toBe("AI_UNAVAILABLE");
    expect(await quota.usage("user-1")).toMatchObject({ IDEA_ANALYSIS: null });
  });
});

describe("AiRunnerService (fake AiClient)", () => {
  const build = (client: AiClient, aiSettings = settings()) => {
    const released = jest.fn();
    const quota = {
      claim: jest.fn().mockResolvedValue({ release: released }),
    };
    const usageLog = jest.fn().mockResolvedValue({});
    const runner = new AiRunnerService(
      client,
      aiSettings,
      { assertGiven: jest.fn() } as never,
      quota as never,
      { aiUsageLog: { create: usageLog } } as never,
    );
    return { runner, released, usageLog, quota };
  };
  const run = {
    userId: "user-1",
    feature: AiFeature.OPPORTUNITY_SUGGESTIONS,
    request: {
      system: OPPORTUNITY_RANKING_SYSTEM,
      prompt: "Rank.",
      schema: opportunityRankingSchema,
      effort: "low" as const,
      maxTokens: 8_000,
    },
  };

  it("is 503 AI_DISABLED with the flag off or no key", async () => {
    const { runner } = build(
      { generate: jest.fn() },
      settings({ AI_ENABLED: "false" }),
    );
    const error = await runner
      .assertReady("user-1")
      .catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe("AI_DISABLED");
    expect(statusOf(error)).toBe(503);
  });

  it("re-validates SUCCESS answers and logs INVALID_OUTPUT when they fail", async () => {
    const client: AiClient = {
      generate: jest.fn().mockResolvedValue({
        outcome: "SUCCESS",
        data: { summary: "", items: "not a list" },
        usage: { ...emptyUsage("claude-sonnet-5-5"), outputTokens: 50 },
      }),
    };
    const { runner, usageLog } = build(client);
    await expect(runner.run(run)).resolves.toMatchObject({
      outcome: "INVALID_OUTPUT",
    });
    expect(usageLog.mock.calls[0][0].data).toMatchObject({
      outcome: "INVALID_OUTPUT",
      output_tokens: 50,
      cost_usd_micros: 500,
    });
  });

  it("turns provider failures into 503 AI_UNAVAILABLE and releases the quota", async () => {
    const client: AiClient = {
      generate: jest.fn().mockRejectedValue(new AiUpstreamError("timeout")),
    };
    const { runner, released, usageLog } = build(client);
    const error = await runner.run(run).catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe("AI_UNAVAILABLE");
    expect(released).toHaveBeenCalled();
    expect(usageLog.mock.calls[0][0].data).toMatchObject({ outcome: "ERROR" });
  });
});

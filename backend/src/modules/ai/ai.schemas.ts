import { z } from "zod";

/**
 * Output contracts. Each schema is sent to the model as the structured
 * output format AND re-checked server-side (lengths, counts, ranges and
 * cross-field rules the provider's JSON schema can't express).
 */
const text = (max: number) => z.string().trim().min(1).max(max);
const rating = z.enum(["LOW", "MEDIUM", "HIGH"]);
const bdt = z.int().min(0).max(10_000_000_000);

const costLine = z
  .object({ item: text(160), minBdt: bdt, maxBdt: bdt })
  .refine((line) => line.minBdt <= line.maxBdt, {
    message: "minBdt must not exceed maxBdt",
  });

export const ideaAnalysisSchema = z
  .object({
    summary: text(600),
    feasibility: z.object({ rating, explanation: text(800) }),
    localMarketFit: z.object({
      rating,
      explanation: text(800),
      targetCustomers: z.array(text(160)).min(1).max(5),
    }),
    startupCostsBdt: z.object({
      items: z.array(costLine).min(1).max(10),
      totalMinBdt: bdt,
      totalMaxBdt: bdt,
      assumptions: text(600),
    }),
    risks: z
      .array(
        z.object({ risk: text(300), severity: rating, mitigation: text(400) }),
      )
      .min(1)
      .max(6),
    nextSteps: z
      .array(z.object({ step: text(300), timeframe: text(80) }))
      .min(1)
      .max(7),
    kaajConnections: z.object({
      experts: z.array(z.object({ field: text(120), why: text(300) })).max(4),
      learning: z.array(z.object({ topic: text(120), why: text(300) })).max(4),
      partners: z
        .array(z.object({ partnerType: text(120), why: text(300) }))
        .max(4),
    }),
  })
  .refine(
    (value) =>
      value.startupCostsBdt.totalMinBdt <= value.startupCostsBdt.totalMaxBdt,
    { message: "totalMinBdt must not exceed totalMaxBdt" },
  );
export type IdeaAnalysis = z.infer<typeof ideaAnalysisSchema>;

export const opportunityRankingSchema = z.object({
  summary: text(400),
  items: z
    .array(
      z.object({
        ref: z.string().trim().min(2).max(8),
        score: z.int().min(0).max(100),
        reason: text(240),
      }),
    )
    .max(20),
});
export type OpportunityRanking = z.infer<typeof opportunityRankingSchema>;

export const growthAreas = [
  "MARKETING",
  "SALES",
  "OPERATIONS",
  "FINANCE",
  "DIGITAL",
  "PARTNERSHIPS",
  "SKILLS",
  "CUSTOMER_SERVICE",
] as const;
export const kaajActions = [
  "POST_JOB",
  "FIND_EXPERT",
  "LEARN_SKILL",
  "JOIN_GROUP",
  "LIST_OFFERING",
  "FIND_PARTNER",
  "NONE",
] as const;

export const growthTipsSchema = z.object({
  summary: text(500),
  tips: z
    .array(
      z
        .object({
          title: text(120),
          detail: text(700),
          area: z.enum(growthAreas),
          effort: rating,
          costBdt: z.object({ min: bdt, max: bdt }),
          kaajAction: z.enum(kaajActions),
        })
        .refine((tip) => tip.costBdt.min <= tip.costBdt.max, {
          message: "costBdt.min must not exceed costBdt.max",
        }),
    )
    .min(3)
    .max(7),
});
export type GrowthTips = z.infer<typeof growthTipsSchema>;

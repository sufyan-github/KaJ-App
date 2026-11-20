import { SetMetadata } from "@nestjs/common";

export const SUBSCRIPTION_FEATURE_KEY = "kaj.subscription.feature";

export const SubscriptionFeature = (featureKey: string) =>
  SetMetadata(SUBSCRIPTION_FEATURE_KEY, featureKey);

export const SubscriptionFeatures = {
  directContact: "DIRECT_CONTACT",
  jobApplication: "JOB_APPLICATION",
  jobPosting: "JOB_POSTING",
  workerDiscovery: "WORKER_DISCOVERY",
  workerHiring: "WORKER_HIRING",
} as const;

/**
 * P4 AI features gated by subscription (WORK module: paid). Opportunity
 * suggestions and growth tips are free (quota-limited) and have no key.
 */
export const AiSubscriptionFeatures = {
  ideaAnalysis: "AI_IDEA_ANALYSIS",
} as const;

/** Feature keys of the free Learn module (owner decision: Learn is free). */
export const LearnFeatures = {
  learnApplication: "LEARN_APPLICATION",
  learnPublishing: "LEARN_PUBLISHING",
} as const;

export type EntitlementModule = "WORK" | "LEARN" | "COMMUNITY" | "BUSINESS";

/**
 * Modules that never require a subscription (owner decisions: Learn and
 * Community are free; R1: Business, partners, collaboration and Ideas are
 * free too). Work stays paid. AI features use their own keys (for example
 * AI_IDEA_ANALYSIS), which count as paid, not as BUSINESS_ keys.
 */
export const FREE_MODULES: readonly EntitlementModule[] = [
  "LEARN",
  "COMMUNITY",
  "BUSINESS",
];

/**
 * The module a feature key belongs to. Work keys are the five existing
 * ones; new modules use a prefix. Unknown keys count as WORK, so a typo can
 * only make something stricter, never free.
 */
export function moduleForFeature(featureKey: string): EntitlementModule {
  if (featureKey.startsWith("LEARN_") || featureKey.startsWith("TRAINING_"))
    return "LEARN";
  if (featureKey.startsWith("COMMUNITY_")) return "COMMUNITY";
  if (featureKey.startsWith("BUSINESS_")) return "BUSINESS";
  return "WORK";
}

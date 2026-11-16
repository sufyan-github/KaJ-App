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

/** Feature keys of the free Learn module (owner decision: Learn is free). */
export const LearnFeatures = {
  learnApplication: "LEARN_APPLICATION",
  learnPublishing: "LEARN_PUBLISHING",
} as const;

export type EntitlementModule = "WORK" | "LEARN" | "COMMUNITY" | "BUSINESS";

/** Modules that never require a subscription. */
export const FREE_MODULES: readonly EntitlementModule[] = [
  "LEARN",
  "COMMUNITY",
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

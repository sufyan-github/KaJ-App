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

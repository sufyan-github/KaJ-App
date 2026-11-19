import { Injectable } from "@nestjs/common";
import { AiFeature } from "@prisma/client";

import { AiSubscriptionFeatures } from "../subscriptions/subscription-feature";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { AiConsentService } from "./ai-consent.service";
import { AiQuotaService } from "./ai-quota.service";
import { AiSettings } from "./ai.settings";

/** GET /ai/status: everything the app needs to show or hide AI features. */
@Injectable()
export class AiStatusService {
  constructor(
    private readonly settings: AiSettings,
    private readonly consent: AiConsentService,
    private readonly quota: AiQuotaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async status(userId: string) {
    const [consent, used, ideaAccess] = await Promise.all([
      this.consent.view(userId),
      this.quota.usage(userId),
      this.subscriptions.subscriberAccessFor(
        userId,
        AiSubscriptionFeatures.ideaAnalysis,
      ),
    ]);
    const feature = (key: AiFeature, subscription: boolean | null) => {
      const limit = this.settings.dailyLimit(key);
      const usedToday = used[key];
      return {
        dailyLimit: limit,
        usedToday,
        remainingToday:
          usedToday === null ? null : Math.max(0, limit - usedToday),
        requiresSubscription: subscription !== null,
        // null for the free features.
        subscriptionActive: subscription,
      };
    };
    return {
      enabled: this.settings.enabled,
      consent,
      quotaResetsAt: this.quota.resetsAt().toISOString(),
      features: {
        IDEA_ANALYSIS: feature(AiFeature.IDEA_ANALYSIS, ideaAccess.allowed),
        OPPORTUNITY_SUGGESTIONS: feature(
          AiFeature.OPPORTUNITY_SUGGESTIONS,
          null,
        ),
        BUSINESS_GROWTH_TIPS: feature(AiFeature.BUSINESS_GROWTH_TIPS, null),
      },
    };
  }
}

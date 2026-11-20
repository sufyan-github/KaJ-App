import { Module } from "@nestjs/common";

import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { MentorsModule } from "../mentors/mentors.module";
import { SafetyModule } from "../safety/safety.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { AI_CLIENT } from "./ai-client";
import { AiConsentService } from "./ai-consent.service";
import { AiQuotaService } from "./ai-quota.service";
import { AiRunnerService } from "./ai-runner.service";
import { AiStatusService } from "./ai-status.service";
import { AiController } from "./ai.controller";
import { AiUsageAdminController } from "./ai-usage-admin.controller";
import { AiUsageAdminService } from "./ai-usage-admin.service";
import { AiSettings } from "./ai.settings";
import { AnthropicAiClient } from "./anthropic-ai.client";
import { BusinessGrowthService } from "./business-growth.service";
import { IdeaAnalysisService } from "./idea-analysis.service";
import { OpportunityRetrievalService } from "./opportunity-retrieval.service";
import { OpportunitySuggestionsService } from "./opportunity-suggestions.service";

/**
 * P4 AI Opportunity Intelligence: idea analysis (subscribers), opportunity
 * suggestions and business growth tips (free, quota-limited). Off unless
 * AI_ENABLED=true and ANTHROPIC_API_KEY is set; tests override AI_CLIENT.
 */
@Module({
  imports: [AdminAuthModule, MentorsModule, SafetyModule, SubscriptionsModule],
  controllers: [AiController, AiUsageAdminController],
  providers: [
    AiSettings,
    {
      provide: AI_CLIENT,
      inject: [AiSettings],
      useFactory: (settings: AiSettings) => new AnthropicAiClient(settings),
    },
    AiConsentService,
    AiQuotaService,
    AiRunnerService,
    AiStatusService,
    IdeaAnalysisService,
    OpportunityRetrievalService,
    OpportunitySuggestionsService,
    BusinessGrowthService,
    AiUsageAdminService,
  ],
})
export class AiModule {}

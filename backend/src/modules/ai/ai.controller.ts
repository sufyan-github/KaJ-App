import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { AiConsentService } from "./ai-consent.service";
import { AiStatusService } from "./ai-status.service";
import { BusinessGrowthService } from "./business-growth.service";
import {
  AiConsentDto,
  AiLocaleDto,
  OpportunitySuggestionsDto,
} from "./dto/ai.dto";
import { IdeaAnalysisService } from "./idea-analysis.service";
import { OpportunitySuggestionsService } from "./opportunity-suggestions.service";

const uuid = () => new ParseUUIDPipe();

/**
 * P4 AI Opportunity Intelligence (docs/api/ai.md). Generation routes check,
 * in order: AI enabled (503 AI_DISABLED) → consent (403
 * AI_CONSENT_REQUIRED) → feature rules (idea consent, subscription) →
 * daily quota (429 AI_QUOTA_EXCEEDED). Ownership is the route policy's job
 * (404 for anyone else), as everywhere.
 */
@ApiTags("ai")
@Controller()
export class AiController {
  constructor(
    private readonly statusService: AiStatusService,
    private readonly consent: AiConsentService,
    private readonly ideas: IdeaAnalysisService,
    private readonly suggestions: OpportunitySuggestionsService,
    private readonly growth: BusinessGrowthService,
  ) {}

  @Get("ai/status")
  @Policy(Policies.authenticated())
  status(@CurrentUser() claims: AccessTokenClaims) {
    return this.statusService.status(claims.sub);
  }

  @Post("ai/consent")
  @Policy(Policies.authenticated())
  accept(@CurrentUser() claims: AccessTokenClaims, @Body() body: AiConsentDto) {
    return this.consent.accept(claims.sub, body.version);
  }

  @Delete("ai/consent")
  @Policy(Policies.authenticated())
  withdraw(@CurrentUser() claims: AccessTokenClaims) {
    return this.consent.withdraw(claims.sub);
  }

  @Post("ai/opportunity-suggestions")
  @Policy(Policies.authenticated())
  suggest(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: OpportunitySuggestionsDto,
  ) {
    return this.suggestions.suggest(claims.sub, {
      locale: body.locale,
      types: body.types,
    });
  }

  @Get("ideas/:id/ai-analysis")
  @Policy(Policies.ideaOwner())
  storedAnalysis(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.ideas.stored(claims.sub, id);
  }

  @Post("ideas/:id/ai-analysis")
  @Policy(Policies.ideaOwner())
  analyse(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: AiLocaleDto,
  ) {
    return this.ideas.analyse(claims.sub, id, body.locale);
  }

  @Post("businesses/:id/ai-growth-tips")
  @Policy(Policies.businessMember())
  growthTips(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: AiLocaleDto,
  ) {
    return this.growth.tips(claims.sub, id, body.locale);
  }
}

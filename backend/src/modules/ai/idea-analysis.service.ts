import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AiFeature, Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { AiSubscriptionFeatures } from "../subscriptions/subscription-feature";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { resolveLocale } from "./ai-locale";
import { AiRunnerService } from "./ai-runner.service";
import { aiErrors } from "./ai.errors";
import { AiLocale, IDEA_ANALYSIS_SYSTEM, userTurn } from "./ai.prompts";
import { IdeaAnalysis, ideaAnalysisSchema } from "./ai.schemas";
import { redactText } from "./redaction";

export interface IdeaAnalysisView {
  ideaId: string;
  analysis: IdeaAnalysis | null;
  locale: string | null;
  model: string | null;
  analyzedAt: string | null;
}

/**
 * AI analysis of one idea, for its owner, subscribers only. Sends only the
 * owner's own idea text (redacted) and reference names — never the team,
 * access requests, viewers or anyone else's data. The validated result is
 * stored on the idea; a refusal or invalid answer stores nothing.
 */
@Injectable()
export class IdeaAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AiRunnerService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** GET: the stored analysis (no model call; works with AI off). */
  async stored(ownerId: string, ideaId: string): Promise<IdeaAnalysisView> {
    const idea = await this.prisma.businessIdea.findFirst({
      where: { id: ideaId, owner_user_id: ownerId, deleted_at: null },
      select: {
        id: true,
        ai_analysis: true,
        ai_analysis_locale: true,
        ai_analysis_model: true,
        ai_analyzed_at: true,
      },
    });
    if (!idea) throw new NotFoundException();
    const parsed = ideaAnalysisSchema.safeParse(idea.ai_analysis);
    return {
      ideaId: idea.id,
      analysis: parsed.success ? parsed.data : null,
      locale: idea.ai_analysis_locale,
      model: idea.ai_analysis_model,
      analyzedAt: idea.ai_analyzed_at?.toISOString() ?? null,
    };
  }

  async analyse(
    ownerId: string,
    ideaId: string,
    requestedLocale?: AiLocale,
  ): Promise<IdeaAnalysisView> {
    await this.runner.assertReady(ownerId);
    const idea = await this.prisma.businessIdea.findFirst({
      where: { id: ideaId, owner_user_id: ownerId, deleted_at: null },
      select: {
        id: true,
        title: true,
        summary: true,
        problem: true,
        solution: true,
        details: true,
        stage: true,
        ai_consent: true,
        category: { select: { name_en: true } },
        location: {
          select: { name_en: true, parent: { select: { name_en: true } } },
        },
        roles: {
          where: { hidden_at: null },
          select: { role_type: true, title: true, time_commitment: true },
          orderBy: { sort_order: "asc" },
          take: 10,
        },
      },
    });
    if (!idea) throw new NotFoundException();
    if (!idea.ai_consent) throw aiErrors.ideaConsentRequired();
    const access = await this.subscriptions.subscriberAccessFor(
      ownerId,
      AiSubscriptionFeatures.ideaAnalysis,
    );
    if (!access.allowed)
      throw new ForbiddenException({
        code: "SUBSCRIPTION_REQUIRED",
        field: "subscription",
        message:
          "Your subscription is inactive or expired. Renew it to continue using this feature.",
        messageKey: "error.subscription.required",
      });

    const locale = await resolveLocale(this.prisma, ownerId, requestedLocale);
    const result = await this.runner.run({
      userId: ownerId,
      feature: AiFeature.IDEA_ANALYSIS,
      subjectId: idea.id,
      request: {
        system: IDEA_ANALYSIS_SYSTEM,
        prompt: userTurn(locale, "Analyse this business idea.", {
          idea: {
            title: redactText(idea.title),
            summary: redactText(idea.summary),
            problem: redactText(idea.problem),
            solution: redactText(idea.solution),
            details: redactText(idea.details),
            stage: idea.stage,
            sector: idea.category.name_en,
            area: idea.location
              ? [idea.location.name_en, idea.location.parent?.name_en]
                  .filter(Boolean)
                  .join(", ")
              : null,
            rolesSought: idea.roles.map((role) => ({
              type: role.role_type,
              title: redactText(role.title),
              commitment: role.time_commitment,
            })),
          },
        }),
        schema: ideaAnalysisSchema,
        effort: "medium",
        maxTokens: 16_000,
      },
    });
    if (result.outcome !== "SUCCESS") throw aiErrors.declined();

    const analyzedAt = new Date();
    await this.prisma.businessIdea.update({
      where: { id: idea.id },
      data: {
        ai_analysis: result.data as unknown as Prisma.InputJsonValue,
        ai_analysis_locale: locale,
        ai_analysis_model: result.usage.model,
        ai_analyzed_at: analyzedAt,
      },
    });
    return {
      ideaId: idea.id,
      analysis: result.data,
      locale,
      model: result.usage.model,
      analyzedAt: analyzedAt.toISOString(),
    };
  }
}

import { Inject, Injectable, Logger } from "@nestjs/common";
import { AiCallOutcome, AiFeature } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AI_CLIENT,
  AiClient,
  AiGenerateRequest,
  AiGenerateResult,
  AiUsage,
  costUsdMicros,
  emptyUsage,
} from "./ai-client";
import { AiConsentService } from "./ai-consent.service";
import { AiQuotaService } from "./ai-quota.service";
import { aiErrors } from "./ai.errors";
import { AiSettings } from "./ai.settings";

export interface AiRun<T> {
  userId: string;
  feature: AiFeature;
  /** The idea or business the call is about (usage log only). */
  subjectId?: string;
  request: AiGenerateRequest<T>;
}

/**
 * The shared pipeline every AI feature goes through after its own checks:
 * claim quota → call the model → validate the answer server-side → log
 * tokens and cost. Refusals and invalid answers come back as results (the
 * feature picks its safe fallback); provider failures become 503
 * AI_UNAVAILABLE and give the quota slot back.
 */
@Injectable()
export class AiRunnerService {
  private readonly logger = new Logger(AiRunnerService.name);

  constructor(
    @Inject(AI_CLIENT) private readonly client: AiClient,
    private readonly settings: AiSettings,
    private readonly consent: AiConsentService,
    private readonly quota: AiQuotaService,
    private readonly prisma: PrismaService,
  ) {}

  /** 503 AI_DISABLED unless AI_ENABLED=true and a key is set. */
  assertEnabled(): void {
    if (!this.settings.enabled) throw aiErrors.disabled();
  }

  /** The checks every feature starts with, in the documented order. */
  async assertReady(userId: string): Promise<void> {
    this.assertEnabled();
    await this.consent.assertGiven(userId);
  }

  async run<T>(run: AiRun<T>): Promise<AiGenerateResult<T>> {
    const ticket = await this.quota.claim(run.userId, run.feature);
    const started = Date.now();
    let result: AiGenerateResult<T>;
    try {
      result = await this.client.generate(run.request);
    } catch (error) {
      await ticket.release();
      await this.log(
        run,
        AiCallOutcome.ERROR,
        emptyUsage(this.settings.model, Date.now() - started),
      );
      this.logger.error({
        msg: "ai call failed",
        feature: run.feature,
        err: error instanceof Error ? error.message : String(error),
      });
      throw aiErrors.unavailable();
    }
    // Validate here too: the client is replaceable, the contract is not.
    if (result.outcome === "SUCCESS") {
      const checked = run.request.schema.safeParse(result.data);
      if (!checked.success)
        result = {
          outcome: "INVALID_OUTPUT",
          data: null,
          usage: result.usage,
          detail: "server validation",
        };
      else result = { ...result, data: checked.data };
    }
    if (result.outcome !== "SUCCESS")
      this.logger.warn({
        msg: "ai answer not used",
        feature: run.feature,
        outcome: result.outcome,
        detail: result.detail,
      });
    await this.log(run, result.outcome, result.usage);
    return result;
  }

  private async log(
    run: AiRun<unknown>,
    outcome: AiCallOutcome,
    usage: AiUsage,
  ) {
    try {
      await this.prisma.aiUsageLog.create({
        data: {
          user_id: run.userId,
          feature: run.feature,
          outcome,
          model: usage.model,
          subject_id: run.subjectId ?? null,
          stop_reason: usage.stopReason,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_read_input_tokens: usage.cacheReadInputTokens,
          cache_creation_input_tokens: usage.cacheCreationInputTokens,
          cost_usd_micros: costUsdMicros(usage),
          latency_ms: usage.latencyMs,
        },
      });
    } catch (error) {
      // A logging failure must not lose an answer the user paid quota for.
      this.logger.error({ msg: "ai usage log failed", err: String(error) });
    }
  }
}

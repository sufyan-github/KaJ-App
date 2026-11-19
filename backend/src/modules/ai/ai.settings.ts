import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiFeature } from "@prisma/client";

/** The consent text version the app must show (bump when the text changes). */
export const AI_CONSENT_VERSION = 1;

/** Reads the AI environment once (see docs/api/ai.md for every variable). */
@Injectable()
export class AiSettings {
  readonly flagEnabled: boolean;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly globalDailyLimit: number;
  private readonly limits: Record<AiFeature, number>;

  constructor(config: ConfigService) {
    this.flagEnabled = config.get<string>("AI_ENABLED", "false") === "true";
    this.apiKey = (config.get<string>("ANTHROPIC_API_KEY") ?? "").trim();
    this.model = config.get<string>("AI_MODEL") ?? "claude-sonnet-5-5";
    this.timeoutMs = Number(config.get("AI_TIMEOUT_MS") ?? 60_000);
    this.maxRetries = Number(config.get("AI_MAX_RETRIES") ?? 2);
    this.globalDailyLimit = Number(
      config.get("AI_GLOBAL_DAILY_LIMIT") ?? 2_000,
    );
    this.limits = {
      IDEA_ANALYSIS: Number(config.get("AI_DAILY_LIMIT_IDEA_ANALYSIS") ?? 3),
      OPPORTUNITY_SUGGESTIONS: Number(
        config.get("AI_DAILY_LIMIT_SUGGESTIONS") ?? 10,
      ),
      BUSINESS_GROWTH_TIPS: Number(
        config.get("AI_DAILY_LIMIT_GROWTH_TIPS") ?? 5,
      ),
    };
  }

  /** On only when the flag is set AND a key is present. */
  get enabled(): boolean {
    return this.flagEnabled && this.apiKey.length > 0;
  }

  dailyLimit(feature: AiFeature): number {
    return this.limits[feature];
  }
}

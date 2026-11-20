import { z } from "zod";

/**
 * The one seam between KAAJ and a language model. Feature services build
 * the (already redacted) prompt; the client only talks to the provider and
 * reports what happened. Tests replace it with a fake (no network in CI).
 */
export const AI_CLIENT = Symbol("AI_CLIENT");

export type AiEffort = "low" | "medium" | "high";

export interface AiGenerateRequest<T> {
  /** Static, cacheable instructions (identical bytes on every call). */
  system: string;
  /** The per-request content: redacted user data plus the output language. */
  prompt: string;
  /** Output shape: sent as the structured-output schema, then re-validated. */
  schema: z.ZodType<T>;
  effort: AiEffort;
  maxTokens: number;
}

export interface AiUsage {
  model: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  latencyMs: number;
}

export type AiGenerateResult<T> =
  | { outcome: "SUCCESS"; data: T; usage: AiUsage }
  | {
      outcome: "REFUSED" | "INVALID_OUTPUT";
      data: null;
      usage: AiUsage;
      /** Refusal category or validation summary, for logs only. */
      detail: string | null;
    };

export interface AiClient {
  /**
   * Resolves for every answer the model gave (including refusals and bad
   * output). Throws AiUpstreamError when no answer came back at all.
   */
  generate<T>(request: AiGenerateRequest<T>): Promise<AiGenerateResult<T>>;
}

/** The provider failed (network, timeout, 5xx, auth) after retries. */
export class AiUpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "AiUpstreamError";
  }
}

/** USD per million tokens (list prices; 5-minute cache writes). */
interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": {
    input: 2,
    output: 10,
    cacheWrite: 2.5,
    cacheRead: 0.1,
  },
  // The server-side refusal fallback for Sonnet 5.5.
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
};

/** Estimated cost in millionths of a dollar (unknown models: Sonnet 5.5). */
export function costUsdMicros(usage: AiUsage): number {
  const price = PRICES[usage.model] ?? PRICES["claude-sonnet-5-5"]!;
  // tokens × $/MTok = micro-dollars.
  return Math.round(
    usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheCreationInputTokens * price.cacheWrite +
      usage.cacheReadInputTokens * price.cacheRead,
  );
}

export function emptyUsage(model: string, latencyMs = 0): AiUsage {
  return {
    model,
    stopReason: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    latencyMs,
  };
}

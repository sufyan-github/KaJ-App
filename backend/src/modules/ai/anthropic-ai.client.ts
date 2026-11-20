import type Anthropic from "@anthropic-ai/sdk";
import { Logger } from "@nestjs/common";

import {
  AiClient,
  AiGenerateRequest,
  AiGenerateResult,
  AiUpstreamError,
  AiUsage,
} from "./ai-client";
import { AiSettings } from "./ai.settings";

/** Server-side retry on a substitute model when Sonnet 5.5 declines. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

type SdkModule = typeof import("@anthropic-ai/sdk");
type ZodHelpers = typeof import("@anthropic-ai/sdk/helpers/zod");

/**
 * The SDK is loaded on the first real call, not at boot: with AI off (the
 * default) and in tests (fake client) it is never loaded at all.
 */
let loaded: { sdk: SdkModule; zod: ZodHelpers } | null = null;
function sdkModules() {
  loaded ??= {
    sdk: require("@anthropic-ai/sdk") as SdkModule,
    zod: require("@anthropic-ai/sdk/helpers/zod") as ZodHelpers,
  };
  return loaded;
}

/**
 * The production AiClient: one Anthropic SDK client, built lazily so the
 * API boots without a key. Per call: the static system prompt is cached
 * (cache_control), the output is constrained by a JSON schema
 * (output_config.format) and re-validated here, a policy decline is retried
 * server-side on the default fallback model, and stop_reason decides
 * whether the text is trusted at all.
 */
export class AnthropicAiClient implements AiClient {
  private readonly logger = new Logger(AnthropicAiClient.name);
  private sdk: Anthropic | null;

  constructor(
    private readonly settings: AiSettings,
    sdk?: Anthropic,
  ) {
    this.sdk = sdk ?? null;
  }

  private client(): Anthropic {
    this.sdk ??= new (sdkModules().sdk.default)({
      apiKey: this.settings.apiKey,
      timeout: this.settings.timeoutMs,
      maxRetries: this.settings.maxRetries,
    });
    return this.sdk;
  }

  async generate<T>(
    request: AiGenerateRequest<T>,
  ): Promise<AiGenerateResult<T>> {
    const format = sdkModules().zod.zodOutputFormat(request.schema);
    const started = Date.now();
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client().beta.messages.create({
        model: this.settings.model,
        max_tokens: request.maxTokens,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        system: [
          {
            type: "text",
            text: request.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: request.prompt }],
        output_config: {
          effort: request.effort,
          format: { type: format.type, schema: format.schema },
        },
      });
    } catch (error) {
      throw upstream(error);
    }

    const usage = usageOf(response, Date.now() - started);
    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? null;
      this.logger.warn({ msg: "ai refusal", category, model: usage.model });
      return { outcome: "REFUSED", data: null, usage, detail: category };
    }
    if (response.stop_reason !== "end_turn") {
      // max_tokens (truncated JSON), pause_turn, tool_use…: never trusted.
      return {
        outcome: "INVALID_OUTPUT",
        data: null,
        usage,
        detail: `stop_reason=${response.stop_reason}`,
      };
    }
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    return validateOutput(request.schema, text, usage);
  }
}

/** JSON-parse and schema-check model text (shared with tests). */
export function validateOutput<T>(
  schema: AiGenerateRequest<T>["schema"],
  text: string,
  usage: AiUsage,
): AiGenerateResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { outcome: "INVALID_OUTPUT", data: null, usage, detail: "json" };
  }
  const result = schema.safeParse(parsed);
  if (!result.success)
    return {
      outcome: "INVALID_OUTPUT",
      data: null,
      usage,
      detail: result.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.code}`)
        .join("; "),
    };
  return { outcome: "SUCCESS", data: result.data, usage };
}

function usageOf(
  response: Anthropic.Beta.BetaMessage,
  latencyMs: number,
): AiUsage {
  return {
    // With a fallback the response names the model that answered.
    model: response.model,
    stopReason: response.stop_reason ?? null,
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    latencyMs,
  };
}

function upstream(error: unknown): AiUpstreamError {
  const { APIConnectionTimeoutError, APIConnectionError, APIError } =
    sdkModules().sdk;
  if (error instanceof APIConnectionTimeoutError)
    return new AiUpstreamError("timeout");
  if (error instanceof APIConnectionError)
    return new AiUpstreamError("connection");
  if (error instanceof APIError)
    // 400s here mean a bug in the request, 401/403 a bad key, 429/5xx
    // exhausted retries; all surface to the user as AI_UNAVAILABLE.
    return new AiUpstreamError(
      `api ${error.status ?? "?"}`,
      error.status ?? null,
    );
  return new AiUpstreamError(
    error instanceof Error ? error.name : "unknown error",
  );
}

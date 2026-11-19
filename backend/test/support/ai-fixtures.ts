import { ConfigService } from "@nestjs/config";

import {
  AiClient,
  AiGenerateRequest,
  AiGenerateResult,
  emptyUsage,
} from "../../src/modules/ai/ai-client";
import { IdeaAnalysis } from "../../src/modules/ai/ai.schemas";

export function validIdeaAnalysis(): IdeaAnalysis {
  return {
    summary: "A shared cold room can cut mango losses if farmers commit early.",
    feasibility: {
      rating: "MEDIUM",
      explanation: "Needs steady power and ten committed farms.",
    },
    localMarketFit: {
      rating: "HIGH",
      explanation: "Chapai Nawabganj loses much of its harvest to rot.",
      targetCustomers: ["Mango farmers in Shibganj", "Local traders"],
    },
    startupCostsBdt: {
      items: [
        {
          item: "Insulated room and cooling unit",
          minBdt: 350_000,
          maxBdt: 450_000,
        },
        { item: "Generator backup", minBdt: 80_000, maxBdt: 120_000 },
      ],
      totalMinBdt: 430_000,
      totalMaxBdt: 570_000,
      assumptions: "Rented land, second-hand cooling unit.",
    },
    risks: [
      {
        risk: "Load-shedding spoils stock",
        severity: "HIGH",
        mitigation: "Generator and insurance.",
      },
    ],
    nextSteps: [
      { step: "Ask ten farmers to pre-book space", timeframe: "2 weeks" },
    ],
    kaajConnections: {
      experts: [{ field: "Cold storage", why: "Sizing the cooling unit." }],
      learning: [
        { topic: "Basic bookkeeping", why: "Track bookings and fees." },
      ],
      partners: [
        { partnerType: "Electrician", why: "Install and maintain backup." },
      ],
    },
  };
}

type Responder = (
  request: AiGenerateRequest<unknown>,
) => AiGenerateResult<unknown> | Error;

/**
 * Fake AiClient for tests: records every request (so tests can assert what
 * would have been sent to the model) and answers with `respond`.
 */
export class FakeAiClient implements AiClient {
  readonly requests: AiGenerateRequest<unknown>[] = [];
  respond: Responder = () => ({
    outcome: "REFUSED",
    data: null,
    usage: emptyUsage("claude-sonnet-5-5"),
    detail: "no responder",
  });

  async generate<T>(
    request: AiGenerateRequest<T>,
  ): Promise<AiGenerateResult<T>> {
    this.requests.push(request as AiGenerateRequest<unknown>);
    const answer = this.respond(request as AiGenerateRequest<unknown>);
    if (answer instanceof Error) throw answer;
    return answer as AiGenerateResult<T>;
  }

  succeed(data: unknown) {
    this.respond = () => ({
      outcome: "SUCCESS",
      data,
      usage: {
        ...emptyUsage("claude-sonnet-5-5", 1_200),
        stopReason: "end_turn",
        inputTokens: 1_000,
        outputTokens: 2_000,
        cacheReadInputTokens: 1_500,
      },
    });
  }

  refuse() {
    this.respond = () => ({
      outcome: "REFUSED",
      data: null,
      usage: {
        ...emptyUsage("claude-sonnet-5-5", 300),
        stopReason: "refusal",
        inputTokens: 1_000,
      },
      detail: "general_harms",
    });
  }

  lastPrompt(): string {
    return this.requests.at(-1)?.prompt ?? "";
  }
}

/**
 * A ConfigService that reads only `values` (the real one prefers
 * process.env, and CI loads .env.example, where AI_ENABLED=false).
 */
export function configOf(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

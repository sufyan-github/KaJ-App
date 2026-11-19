/**
 * One real model call, for a developer's machine only (never CI):
 *
 *   ANTHROPIC_API_KEY=… corepack pnpm --filter @kaj/backend ai:live-check [bn|en]
 *
 * Analyses a made-up idea with the production client, prompt and schema,
 * then prints the outcome, token usage and estimated cost. No database.
 */
import { ConfigService } from "@nestjs/config";

import { costUsdMicros } from "../src/modules/ai/ai-client";
import { IDEA_ANALYSIS_SYSTEM, userTurn } from "../src/modules/ai/ai.prompts";
import { ideaAnalysisSchema } from "../src/modules/ai/ai.schemas";
import { AiSettings } from "../src/modules/ai/ai.settings";
import { AnthropicAiClient } from "../src/modules/ai/anthropic-ai.client";
import { redactText } from "../src/modules/ai/redaction";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY to run the live check.");
    process.exit(1);
  }
  const locale = process.argv[2] === "en" ? "en" : "bn";
  const settings = new AiSettings(
    new ConfigService({ ...process.env, AI_ENABLED: "true" }),
  );
  const client = new AnthropicAiClient(settings);
  const prompt = userTurn(locale, "Analyse this business idea.", {
    idea: {
      title: "Shared cold room for mango farmers",
      summary: "A shared cold room so farmers sell later at better prices.",
      problem: "Mango farmers in Shibganj lose a third of the harvest to rot.",
      solution: redactText(
        "A solar cold room shared by ten farms, booked by SMS on 01712345678.",
      ),
      details: null,
      stage: "CONCEPT",
      sector: "Agriculture",
      area: "Shibganj, Chapai Nawabganj",
      rolesSought: [
        { type: "MARKETING", title: null, commitment: "PART_TIME" },
      ],
    },
  });
  for (const run of [1, 2]) {
    const result = await client.generate({
      system: IDEA_ANALYSIS_SYSTEM,
      prompt,
      schema: ideaAnalysisSchema,
      effort: "medium",
      maxTokens: 16_000,
    });
    console.log(
      JSON.stringify(
        {
          run,
          outcome: result.outcome,
          usage: result.usage,
          estimatedCostUsd: costUsdMicros(result.usage) / 1_000_000,
          ...(run === 1 ? { data: result.data } : {}),
          ...(result.outcome === "SUCCESS" ? {} : { detail: result.detail }),
        },
        null,
        2,
      ),
    );
  }
  console.log("Run 2 should show cache_read_input_tokens > 0 (prompt cache).");
}

void main();

import { Inject, Injectable } from "@nestjs/common";
import { AiFeature } from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { resolveLocale } from "./ai-locale";
import { AiRunnerService } from "./ai-runner.service";
import { AiLocale, OPPORTUNITY_RANKING_SYSTEM, userTurn } from "./ai.prompts";
import { opportunityRankingSchema } from "./ai.schemas";
import {
  Candidate,
  OpportunityKind,
  OpportunityRetrievalService,
} from "./opportunity-retrieval.service";

export const OPPORTUNITY_KINDS: readonly OpportunityKind[] = [
  "JOB",
  "LEARNING",
  "MENTOR",
  "GROUP",
];
const MAX_ITEMS = 15;

export interface SuggestionItem {
  type: OpportunityKind;
  id: string;
  title: string;
  area: { nameEn: string; nameBn: string } | null;
  /** 0–100 from the model; null in the fallback list. */
  score: number | null;
  reason: string | null;
}

export interface SuggestionsView {
  /** AI = ranked by the model; FALLBACK = server order (model declined or
   * answered badly); NONE = nothing to suggest (no model call, no quota). */
  source: "AI" | "FALLBACK" | "NONE";
  locale: AiLocale;
  summary: string | null;
  generatedAt: string;
  items: SuggestionItem[];
}

/**
 * Free, quota-limited: rank KAAJ's own opportunities for the user. The
 * model sees refs (J1, L2, M3, G4), never ids or other people's names, and
 * any ref it returns that the server didn't send is dropped.
 */
@Injectable()
export class OpportunitySuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AiRunnerService,
    private readonly retrieval: OpportunityRetrievalService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async suggest(
    userId: string,
    options: { locale?: AiLocale; types?: OpportunityKind[] } = {},
  ): Promise<SuggestionsView> {
    await this.runner.assertReady(userId);
    const locale = await resolveLocale(this.prisma, userId, options.locale);
    const kinds = options.types?.length
      ? options.types
      : [...OPPORTUNITY_KINDS];
    const { me, candidates } = await this.retrieval.retrieve(userId, kinds);
    const view = (
      source: SuggestionsView["source"],
      items: SuggestionItem[],
      summary: string | null = null,
    ): SuggestionsView => ({
      source,
      locale,
      summary,
      generatedAt: this.clock.now().toISOString(),
      items,
    });
    if (candidates.length === 0) return view("NONE", []);

    const result = await this.runner.run({
      userId,
      feature: AiFeature.OPPORTUNITY_SUGGESTIONS,
      request: {
        system: OPPORTUNITY_RANKING_SYSTEM,
        prompt: userTurn(locale, "Rank these KAAJ opportunities for me.", {
          me,
          candidates: candidates.map((candidate) => candidate.forModel),
        }),
        schema: opportunityRankingSchema,
        effort: "low",
        maxTokens: 8_000,
      },
    });
    if (result.outcome !== "SUCCESS")
      return view("FALLBACK", fallbackOrder(candidates));

    const byRef = new Map(
      candidates.map((candidate) => [candidate.ref, candidate]),
    );
    const seen = new Set<string>();
    const items: SuggestionItem[] = [];
    for (const ranked of [...result.data.items].sort(
      (a, b) => b.score - a.score,
    )) {
      const candidate = byRef.get(ranked.ref.trim().toUpperCase());
      if (!candidate || seen.has(candidate.ref)) continue; // invented or repeated
      seen.add(candidate.ref);
      items.push({
        ...card(candidate),
        score: ranked.score,
        reason: ranked.reason,
      });
      if (items.length === MAX_ITEMS) break;
    }
    return view("AI", items, result.data.summary);
  }
}

function card(candidate: Candidate) {
  return {
    type: candidate.kind,
    id: candidate.id,
    title: candidate.title,
    area: candidate.area,
  };
}

/** Round-robin over kinds in retrieval order (nearest / newest first). */
export function fallbackOrder(candidates: Candidate[]): SuggestionItem[] {
  const queues = OPPORTUNITY_KINDS.map((kind) =>
    candidates.filter((candidate) => candidate.kind === kind),
  );
  const items: SuggestionItem[] = [];
  while (items.length < MAX_ITEMS && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && items.length < MAX_ITEMS)
        items.push({ ...card(next), score: null, reason: null });
    }
  }
  return items;
}

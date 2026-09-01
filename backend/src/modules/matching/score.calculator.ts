export const defaultMatchingWeights = {
  skill: 0.3,
  location: 0.15,
  availability: 0.15,
  budget: 0.1,
  experience: 0.1,
  rating: 0.1,
  reliability: 0.1,
} as const;

export type MatchFactor = keyof typeof defaultMatchingWeights;
export type MatchingWeights = Record<MatchFactor, number>;
export type MatchSignals = Record<MatchFactor, number | null | undefined>;

export interface MatchExplanation {
  score: number;
  components: Record<MatchFactor, number>;
  reasons: string[];
}

const labels: Record<MatchFactor, string> = {
  skill: "Skills match",
  location: "Nearby service area",
  availability: "Available for this time",
  budget: "Rate fits the budget",
  experience: "Relevant experience",
  rating: "Strong worker rating",
  reliability: "Reliable work history",
};

export function normalizeMatchingWeights(value: unknown): MatchingWeights {
  const source = isRecord(value) ? value : {};
  const candidate = Object.fromEntries(
    Object.keys(defaultMatchingWeights).map((key) => {
      const factor = key as MatchFactor;
      const parsed = Number(source[factor]);
      return [
        factor,
        Number.isFinite(parsed) && parsed >= 0
          ? parsed
          : defaultMatchingWeights[factor],
      ];
    }),
  ) as MatchingWeights;
  const sum = Object.values(candidate).reduce((total, item) => total + item, 0);
  if (!Number.isFinite(sum) || sum <= 0) return { ...defaultMatchingWeights };
  return Object.fromEntries(
    Object.entries(candidate).map(([key, item]) => [key, item / sum]),
  ) as MatchingWeights;
}

export function calculateMatch(
  signals: MatchSignals,
  weights: MatchingWeights = defaultMatchingWeights,
): MatchExplanation {
  const normalizedWeights = normalizeMatchingWeights(weights);
  const components = {} as Record<MatchFactor, number>;
  const rankedReasons: Array<{ factor: MatchFactor; contribution: number }> =
    [];
  let weightedScore = 0;

  for (const factor of Object.keys(defaultMatchingWeights) as MatchFactor[]) {
    const signal = clamp(Number(signals[factor] ?? 0));
    const contribution = signal * normalizedWeights[factor];
    components[factor] = round(contribution * 100);
    weightedScore += contribution;
    if (signal >= 0.6) rankedReasons.push({ factor, contribution });
  }

  rankedReasons.sort(
    (a, b) =>
      b.contribution - a.contribution || a.factor.localeCompare(b.factor),
  );
  return {
    score: Math.round(clamp(weightedScore) * 100),
    components,
    reasons: rankedReasons.slice(0, 3).map(({ factor }) => labels[factor]),
  };
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

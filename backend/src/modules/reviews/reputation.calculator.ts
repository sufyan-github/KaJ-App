export const REVIEW_PRIOR_COUNT = 5;
export const REVIEW_PRIOR_AVERAGE = 4;

export function rawRating(ratings: readonly number[]): number {
  if (ratings.length === 0) return 0;
  return round(
    ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
  );
}

export function dampedRating(ratings: readonly number[]): number {
  return round(
    (REVIEW_PRIOR_COUNT * REVIEW_PRIOR_AVERAGE +
      ratings.reduce((sum, rating) => sum + rating, 0)) /
      (REVIEW_PRIOR_COUNT + ratings.length),
  );
}

export function rateBps(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000);
}

export interface WorkerReputationFacts {
  completedJobs: number;
  cancelledJobs: number;
  noShows: number;
  rawRating: number;
  ratingCount: number;
}

export function workerReliability(facts: WorkerReputationFacts): number {
  const total = facts.completedJobs + facts.cancelledJobs + facts.noShows;
  if (total === 0) return 0;
  const completion = facts.completedJobs / total;
  const rating = facts.ratingCount === 0 ? 0.8 : facts.rawRating / 5;
  return Math.max(0, Math.min(1, round(completion * 0.7 + rating * 0.3, 4)));
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

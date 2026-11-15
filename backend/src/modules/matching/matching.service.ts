import { Injectable } from "@nestjs/common";
import { JobType, PaymentModel, Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  applyTrainingBonus,
  calculateMatch,
  type MatchExplanation,
  normalizeMatchingWeights,
} from "./score.calculator";
import { DHAKA_OFFSET_MINUTES } from "../availability/availability.calculator";

export const workerSelect = {
  id: true,
  profile: { select: { display_name: true, primary_location_id: true } },
  worker_profile: {
    select: {
      hourly_rate_poisha: true,
      daily_rate_poisha: true,
      monthly_rate_poisha: true,
      experience_years: true,
      rating_avg: true,
      rating_count: true,
      reliability_score: true,
      completed_jobs_count: true,
    },
  },
  skills: {
    select: {
      skill_id: true,
      skill: { select: { name_en: true, name_bn: true } },
    },
  },
  service_areas: { select: { location_id: true } },
  availability_rules: {
    where: { is_active: true },
    select: { day_of_week: true, start_time: true, end_time: true },
  },
  training_certificates: {
    where: { revoked_at: null, course: { skill_id: { not: null } } },
    select: { course: { select: { skill_id: true } } },
  },
} satisfies Prisma.UserSelect;

type Worker = Prisma.UserGetPayload<{ select: typeof workerSelect }>;
type MatchableJob = {
  id: string;
  poster_user_id: string;
  location_id: string;
  starts_at: Date | null;
  ends_at: Date | null;
  experience_min_years: number | null;
  payment_model: PaymentModel;
  job_type: JobType;
  budget_max_poisha: bigint | null;
  skills: Array<{ skill_id: string }>;
};

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async scoreJobsForWorker<T extends MatchableJob>(
    workerUserId: string,
    jobs: T[],
  ) {
    const worker = await this.prisma.user.findUnique({
      where: { id: workerUserId },
      select: workerSelect,
    });
    if (!worker?.worker_profile)
      return jobs.map((job) => ({ job, match: emptyMatch() }));
    const weights = await this.weights();
    return jobs
      .filter((job) => job.poster_user_id !== workerUserId)
      .map((job) => ({ job, match: this.score(job, worker, weights) }))
      .sort(
        (a, b) =>
          b.match.score - a.match.score || a.job.id.localeCompare(b.job.id),
      );
  }

  /** `excludeUserIds`: people in a block with the poster never appear. */
  async suggestedWorkers(job: MatchableJob, excludeUserIds: string[] = []) {
    const requiredSkillIds = job.skills.map((item) => item.skill_id);
    const excluded = [job.poster_user_id, ...excludeUserIds];
    let workers = await this.workers(
      job.id,
      excluded,
      requiredSkillIds.length ? requiredSkillIds : undefined,
    );
    if (workers.length === 0 && requiredSkillIds.length)
      workers = await this.workers(job.id, excluded);
    const weights = await this.weights();
    return workers
      .filter(
        (worker) => worker.id !== job.poster_user_id && worker.worker_profile,
      )
      .map((worker) => ({ worker, match: this.score(job, worker, weights) }))
      .sort(
        (a, b) =>
          b.match.score - a.match.score ||
          a.worker.id.localeCompare(b.worker.id),
      )
      .slice(0, 20);
  }

  /**
   * The workers worth scoring, in a deterministic order: nearest to the job
   * first (the worker's own point, else their area centre, against the job's
   * pin, else its area centre; unknown distances last), then rating,
   * completed jobs and id. Previously it took 100 workers in no order, so with
   * more than 100 workers the suggestions were an arbitrary subset.
   */
  private async workers(
    jobId: string,
    excludeUserIds: string[],
    skillIds?: string[],
  ) {
    const candidates = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH site AS (
        SELECT COALESCE(j.lat, l.lat)::float8 AS lat,
               COALESCE(j.lng, l.lng)::float8 AS lng
        FROM jobs j
        JOIN locations l ON l.id = j.location_id
        WHERE j.id = ${jobId}::uuid
      )
      SELECT u.id
      FROM users u
      JOIN worker_profiles wp ON wp.user_id = u.id
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN locations pl ON pl.id = p.primary_location_id
      LEFT JOIN site ON true
      WHERE u.status = 'ACTIVE'
        AND u.deleted_at IS NULL
        AND 'WORKER' = ANY (u.role_modes::text[])
        AND COALESCE(p.discoverable, true)
        AND NOT (u.id = ANY (${excludeUserIds}::uuid[]))
        AND (
          ${skillIds ?? null}::uuid[] IS NULL
          OR EXISTS (
            SELECT 1 FROM user_skills us
            WHERE us.user_id = u.id
              AND us.skill_id = ANY (${skillIds ?? null}::uuid[])
          )
        )
      ORDER BY
        CASE
          WHEN site.lat IS NULL OR COALESCE(p.lat, pl.lat) IS NULL THEN NULL
          ELSE earth_distance(
            ll_to_earth(site.lat, site.lng),
            ll_to_earth(
              COALESCE(p.lat, pl.lat)::float8,
              COALESCE(p.lng, pl.lng)::float8
            )
          )
        END ASC NULLS LAST,
        wp.rating_avg DESC,
        wp.completed_jobs_count DESC,
        u.id ASC
      LIMIT 100`;
    if (candidates.length === 0) return [];
    const order = new Map(candidates.map((row, index) => [row.id, index]));
    const rows = await this.prisma.user.findMany({
      where: { id: { in: [...order.keys()] } },
      select: workerSelect,
    });
    return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }

  private async weights() {
    const setting = await this.prisma.configSetting.findUnique({
      where: { key: "matching.weights" },
      select: { value_json: true },
    });
    return normalizeMatchingWeights(setting?.value_json);
  }

  private score(
    job: MatchableJob,
    worker: Worker,
    weights: ReturnType<typeof normalizeMatchingWeights>,
  ) {
    const workerSkillIds = new Set(worker.skills.map((item) => item.skill_id));
    const requiredSkillIds = job.skills.map((item) => item.skill_id);
    const certifiedSkillIds = new Set(
      worker.training_certificates.flatMap((item) =>
        item.course.skill_id ? [item.course.skill_id] : [],
      ),
    );
    const skill = applyTrainingBonus(
      requiredSkillIds.length === 0
        ? 0.5
        : requiredSkillIds.filter((id) => workerSkillIds.has(id)).length /
            requiredSkillIds.length,
      requiredSkillIds,
      certifiedSkillIds,
    );
    const locations = new Set(
      [
        worker.profile?.primary_location_id,
        ...worker.service_areas.map((item) => item.location_id),
      ].filter(Boolean),
    );
    const profile = worker.worker_profile;
    const experience = job.experience_min_years
      ? Math.min(1, (profile?.experience_years ?? 0) / job.experience_min_years)
      : 0.7;
    const rate = rateFor(job, profile);
    const budget =
      !job.budget_max_poisha || !rate
        ? 0.5
        : rate <= job.budget_max_poisha
          ? 1
          : Number(job.budget_max_poisha) / Number(rate);
    return calculateMatch(
      {
        skill,
        location: locations.has(job.location_id) ? 1 : 0,
        availability: availabilitySignal(job, worker),
        budget,
        experience,
        rating: rankingRating(
          Number(profile?.rating_avg ?? 0),
          profile?.rating_count ?? 0,
        ),
        reliability: rankingReliability(
          Number(profile?.reliability_score ?? 0),
          profile?.completed_jobs_count ?? 0,
        ),
      },
      weights,
    );
  }
}

function availabilitySignal(job: MatchableJob, worker: Worker): number {
  if (!job.starts_at || !job.ends_at)
    return worker.availability_rules.length ? 0.7 : 0.4;
  const slot = dhakaLocalSlot(job.starts_at, job.ends_at);
  if (!slot) return 0;
  const { day, start, end } = slot;
  return worker.availability_rules.some(
    (rule) =>
      rule.day_of_week === day &&
      minutes(rule.start_time) <= start &&
      minutes(rule.end_time) >= end,
  )
    ? 1
    : 0;
}

function minutes(value: Date) {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

function rateFor(job: MatchableJob, profile: Worker["worker_profile"]) {
  if (!profile) return null;
  if (job.payment_model === PaymentModel.HOURLY)
    return profile.hourly_rate_poisha;
  if (job.payment_model === PaymentModel.DAILY)
    return profile.daily_rate_poisha;
  if (
    job.payment_model === PaymentModel.MONTHLY ||
    job.job_type === JobType.FULL_TIME
  ) {
    return profile.monthly_rate_poisha;
  }
  return profile.daily_rate_poisha ?? profile.hourly_rate_poisha;
}

function emptyMatch(): MatchExplanation {
  return calculateMatch({
    skill: 0,
    location: 0,
    availability: 0,
    budget: 0,
    experience: 0,
    rating: 0,
    reliability: 0,
  });
}

/**
 * Availability rules are stored as Dhaka wall-clock times. Job times are UTC
 * instants, so they must be shifted before comparing; using the UTC hours
 * was six hours off, and the weekday was wrong for 00:00–06:00 Dhaka.
 * Returns null for a slot that crosses local midnight (no rule can cover it).
 */
export function dhakaLocalSlot(startsAt: Date, endsAt: Date) {
  const offset = DHAKA_OFFSET_MINUTES * 60_000;
  const start = new Date(startsAt.getTime() + offset);
  const end = new Date(endsAt.getTime() + offset);
  if (start.getUTCDay() !== end.getUTCDay()) return null;
  return {
    day: start.getUTCDay(),
    start: start.getUTCHours() * 60 + start.getUTCMinutes(),
    end: end.getUTCHours() * 60 + end.getUTCMinutes(),
  };
}

const RATING_PRIOR_COUNT = 5;
const RATING_PRIOR_AVERAGE = 4;
const RELIABILITY_MIN_JOBS = 5;
const NEUTRAL_RELIABILITY = 0.75;

/**
 * Damped rating (spec D7) for ranking: a new worker starts at the neutral
 * prior instead of 0, and one early review can't dominate.
 */
export function rankingRating(average: number, count: number) {
  return (
    (RATING_PRIOR_COUNT * RATING_PRIOR_AVERAGE + average * count) /
    (RATING_PRIOR_COUNT + count) /
    5
  );
}

/** Too few jobs to judge: neutral, never the worst score. */
export function rankingReliability(score: number, completedJobs: number) {
  return completedJobs < RELIABILITY_MIN_JOBS ? NEUTRAL_RELIABILITY : score;
}

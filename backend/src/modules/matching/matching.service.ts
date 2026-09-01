import { Injectable } from "@nestjs/common";
import {
  JobType,
  PaymentModel,
  Prisma,
  RoleMode,
  UserStatus,
} from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  calculateMatch,
  type MatchExplanation,
  normalizeMatchingWeights,
} from "./score.calculator";

const workerSelect = {
  id: true,
  profile: { select: { display_name: true, primary_location_id: true } },
  worker_profile: {
    select: {
      hourly_rate_poisha: true,
      daily_rate_poisha: true,
      monthly_rate_poisha: true,
      experience_years: true,
      rating_avg: true,
      reliability_score: true,
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

  async suggestedWorkers(job: MatchableJob) {
    const requiredSkillIds = job.skills.map((item) => item.skill_id);
    let workers = await this.workers(
      requiredSkillIds.length ? requiredSkillIds : undefined,
    );
    if (workers.length === 0 && requiredSkillIds.length)
      workers = await this.workers();
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

  private workers(skillIds?: string[]) {
    return this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        deleted_at: null,
        role_modes: { has: RoleMode.WORKER },
        worker_profile: { isNot: null },
        skills: skillIds ? { some: { skill_id: { in: skillIds } } } : undefined,
      },
      select: workerSelect,
      take: 100,
    });
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
    const skill =
      requiredSkillIds.length === 0
        ? 0.5
        : requiredSkillIds.filter((id) => workerSkillIds.has(id)).length /
          requiredSkillIds.length;
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
        rating: Number(profile?.rating_avg ?? 0) / 5,
        reliability: Number(profile?.reliability_score ?? 0),
      },
      weights,
    );
  }
}

function availabilitySignal(job: MatchableJob, worker: Worker): number {
  if (!job.starts_at || !job.ends_at)
    return worker.availability_rules.length ? 0.7 : 0.4;
  const day = job.starts_at.getUTCDay();
  const start =
    job.starts_at.getUTCHours() * 60 + job.starts_at.getUTCMinutes();
  const end = job.ends_at.getUTCHours() * 60 + job.ends_at.getUTCMinutes();
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

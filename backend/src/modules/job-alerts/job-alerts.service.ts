import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateJobAlertDto } from "./dto/job-alert.dto";
import {
  alertMatchesJob,
  MAX_ALERT_NOTIFICATIONS_PER_JOB,
  MAX_JOB_ALERTS,
  normalizeAlertFilters,
  sameAlertFilters,
  type AlertableJob,
  type JobAlertFilters,
} from "./job-alert.rules";
import {
  jobAlertDuplicateError,
  jobAlertFilterUnavailableError,
  jobAlertLimitError,
} from "./job-alerts.errors";

type NamedRow = { id: string; name_en: string; name_bn: string };

@Injectable()
export class JobAlertsService {
  private readonly logger = new Logger(JobAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.savedSearch.findMany({
      where: { user_id: userId, notify: true },
      orderBy: { created_at: "desc" },
    });
    const alerts = rows.map((row) => ({
      row,
      filters: normalizeAlertFilters(row.filters_json),
    }));
    const names = await this.names(alerts.map(({ filters }) => filters));
    return {
      items: alerts.map(({ row, filters }) =>
        serializeAlert(row, filters, names),
      ),
    };
  }

  async create(userId: string, input: CreateJobAlertDto) {
    const filters = normalizeAlertFilters(input);
    const [existing, category, skill, location] = await Promise.all([
      this.prisma.savedSearch.findMany({
        where: { user_id: userId, notify: true },
        select: { filters_json: true },
      }),
      filters.categoryId
        ? this.prisma.category.findFirst({
            where: { id: filters.categoryId, is_active: true },
            select: { id: true },
          })
        : null,
      filters.skillId
        ? this.prisma.skill.findFirst({
            where: { id: filters.skillId, is_active: true },
            select: { id: true },
          })
        : null,
      filters.locationId
        ? this.prisma.location.findFirst({
            where: { id: filters.locationId, is_active: true },
            select: { id: true },
          })
        : null,
    ]);
    if (filters.categoryId && !category) {
      throw jobAlertFilterUnavailableError("categoryId");
    }
    if (filters.skillId && !skill) {
      throw jobAlertFilterUnavailableError("skillId");
    }
    if (filters.locationId && !location) {
      throw jobAlertFilterUnavailableError("locationId");
    }
    if (
      existing.some((row) =>
        sameAlertFilters(normalizeAlertFilters(row.filters_json), filters),
      )
    ) {
      throw jobAlertDuplicateError();
    }
    if (existing.length >= MAX_JOB_ALERTS) throw jobAlertLimitError();

    const row = await this.prisma.savedSearch.create({
      data: {
        user_id: userId,
        filters_json: filters as Prisma.InputJsonObject,
        notify: true,
      },
    });
    const names = await this.names([filters]);
    return serializeAlert(row, filters, names);
  }

  async remove(userId: string, alertId: string): Promise<void> {
    const result = await this.prisma.savedSearch.deleteMany({
      where: { id: alertId, user_id: userId, notify: true },
    });
    if (result.count !== 1) throw new NotFoundException();
  }

  /**
   * Called after a job becomes publicly open. Failures are logged and
   * swallowed: publishing must never fail because of alerts.
   */
  async notifyForPublishedJob(
    job: AlertableJob & { id: string; title: string; poster_user_id: string },
  ): Promise<number> {
    try {
      return await this.fanOut(job);
    } catch (error) {
      this.logger.error(
        `Job alert notifications failed for job ${job.id}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return 0;
    }
  }

  private async fanOut(
    job: AlertableJob & { id: string; title: string; poster_user_id: string },
  ): Promise<number> {
    // A matching alert has every set filter equal to one of the job values,
    // so it must match at least one of these; the exact rule runs in memory.
    const candidates: Prisma.SavedSearchWhereInput[] = [
      { filters_json: { path: ["categoryId"], equals: job.category_id } },
      { filters_json: { path: ["locationId"], equals: job.location_id } },
      ...(job.subcategory_id
        ? [
            {
              filters_json: {
                path: ["categoryId"],
                equals: job.subcategory_id,
              },
            },
          ]
        : []),
      ...job.skills.map((skill) => ({
        filters_json: { path: ["skillId"], equals: skill.skill_id },
      })),
    ];
    const alerts = await this.prisma.savedSearch.findMany({
      where: {
        notify: true,
        user_id: { not: job.poster_user_id },
        user: { status: UserStatus.ACTIVE, deleted_at: null },
        OR: candidates,
      },
      select: { id: true, user_id: true, filters_json: true },
      orderBy: { created_at: "asc" },
      take: MAX_ALERT_NOTIFICATIONS_PER_JOB * MAX_JOB_ALERTS,
    });
    // One notification per person, even when several of their alerts match.
    const byUser = new Map<string, string>();
    for (const alert of alerts) {
      if (byUser.size >= MAX_ALERT_NOTIFICATIONS_PER_JOB) break;
      if (byUser.has(alert.user_id)) continue;
      if (alertMatchesJob(normalizeAlertFilters(alert.filters_json), job)) {
        byUser.set(alert.user_id, alert.id);
      }
    }
    return this.notifications.createMany(
      [...byUser].map(([userId, alertId]) => ({
        userId,
        type: "JOB_ALERT_MATCH",
        title: "আপনার জন্য নতুন কাজ",
        body: `আপনার সতর্কতার সাথে মেলে এমন নতুন কাজ: ${job.title}`,
        payload: { route: `/jobs/${job.id}`, jobId: job.id, alertId },
        dedupeKey: `job-alert:${alertId}:${job.id}`,
      })),
    );
  }

  private async names(filters: readonly JobAlertFilters[]) {
    const ids = (key: keyof JobAlertFilters) => [
      ...new Set(filters.flatMap((item) => (item[key] ? [item[key]] : []))),
    ];
    const select = { id: true, name_en: true, name_bn: true } as const;
    const [categories, skills, locations] = await Promise.all([
      this.prisma.category.findMany({
        where: { id: { in: ids("categoryId") } },
        select,
      }),
      this.prisma.skill.findMany({
        where: { id: { in: ids("skillId") } },
        select,
      }),
      this.prisma.location.findMany({
        where: { id: { in: ids("locationId") } },
        select,
      }),
    ]);
    const index = (rows: NamedRow[]) =>
      new Map(rows.map((row) => [row.id, row]));
    return {
      categories: index(categories),
      skills: index(skills),
      locations: index(locations),
    };
  }
}

function serializeAlert(
  row: { id: string; created_at: Date },
  filters: JobAlertFilters,
  names: {
    categories: Map<string, NamedRow>;
    skills: Map<string, NamedRow>;
    locations: Map<string, NamedRow>;
  },
) {
  const parts = [
    filters.categoryId ? names.categories.get(filters.categoryId) : undefined,
    filters.skillId ? names.skills.get(filters.skillId) : undefined,
    filters.locationId ? names.locations.get(filters.locationId) : undefined,
  ].filter((item): item is NamedRow => Boolean(item));
  return {
    id: row.id,
    categoryId: filters.categoryId ?? null,
    skillId: filters.skillId ?? null,
    locationId: filters.locationId ?? null,
    labelEn: parts.map((part) => part.name_en).join(" · ") || "All jobs",
    labelBn: parts.map((part) => part.name_bn).join(" · ") || "সব কাজ",
    createdAt: row.created_at.toISOString(),
  };
}

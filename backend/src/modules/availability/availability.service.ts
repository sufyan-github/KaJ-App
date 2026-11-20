import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  AssignmentStatus,
  MentorStatus,
  Prisma,
  RoleMode,
} from "@prisma/client";

import { roleRequiredError } from "../../common/errors/authorization.errors";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { EngagementService } from "../safety/engagement.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import {
  AvailabilityRuleInput,
  calculateAvailability,
  DHAKA_OFFSET_MINUTES,
  TimeWindow,
} from "./availability.calculator";
import {
  AvailabilityRuleDto,
  CreateAvailabilityExceptionDto,
} from "./dto/availability.dto";

const BLOCKING_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.CONFIRMED,
];

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly userBlocks?: UserBlocksService,
    @Optional() private readonly engagementService?: EngagementService,
    @Optional() @Inject(CLOCK) private readonly clock?: Clock,
  ) {}

  private now() {
    return this.clock?.now() ?? new Date();
  }

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  private get engagement() {
    return this.engagementService ?? new EngagementService(this.prisma);
  }

  async getAvailability(userId: string) {
    const [rules, exceptions] = await Promise.all([
      this.prisma.availabilityRule.findMany({
        where: { user_id: userId, is_active: true },
        orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
      }),
      this.prisma.availabilityException.findMany({
        where: { user_id: userId },
        orderBy: { starts_at: "asc" },
      }),
    ]);
    return {
      rules: rules.map((rule) => ({
        id: rule.id,
        dayOfWeek: rule.day_of_week,
        startTime: formatTime(rule.start_time),
        endTime: formatTime(rule.end_time),
      })),
      exceptions: exceptions.map(mapException),
    };
  }

  async replaceRules(userId: string, rules: AvailabilityRuleDto[]) {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.availabilityRule.deleteMany({
        where: { user_id: userId },
      });
      if (rules.length > 0) {
        await transaction.availabilityRule.createMany({
          data: rules.map((rule) => ({
            user_id: userId,
            day_of_week: rule.dayOfWeek,
            start_time: parseTime(rule.startTime),
            end_time: parseTime(rule.endTime),
          })),
        });
      }
    });
    return this.getAvailability(userId);
  }

  async createException(userId: string, input: CreateAvailabilityExceptionDto) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException("Exception end must be after its start.");
    }
    return mapException(
      await this.prisma.availabilityException.create({
        data: {
          user_id: userId,
          starts_at: startsAt,
          ends_at: endsAt,
          reason: input.reason?.trim(),
        },
      }),
    );
  }

  async deleteException(
    userId: string,
    id: string,
  ): Promise<{ deleted: true }> {
    const result = await this.prisma.availabilityException.deleteMany({
      where: { id, user_id: userId },
    });
    if (result.count === 0) throw new NotFoundException();
    return { deleted: true };
  }

  async evaluate(
    userId: string,
    jobWindow: TimeWindow | undefined,
    minCoverage: number,
    travelBufferMinutes = 30,
  ) {
    const travelBufferMs = travelBufferMinutes * 60_000;
    const bounds = jobWindow
      ? {
          starts_at: { lt: jobWindow.endsAt },
          ends_at: { gt: jobWindow.startsAt },
        }
      : undefined;
    const [rules, exceptions, assignments] = await Promise.all([
      this.prisma.availabilityRule.findMany({
        where: { user_id: userId, is_active: true },
      }),
      this.prisma.availabilityException.findMany({
        where: { user_id: userId, ...bounds },
      }),
      jobWindow
        ? this.prisma.assignment.findMany({
            where: {
              worker_user_id: userId,
              status: { in: BLOCKING_ASSIGNMENT_STATUSES },
              agreed_starts_at: {
                not: null,
                lt: new Date(jobWindow.endsAt.getTime() + travelBufferMs),
              },
              agreed_ends_at: {
                not: null,
                gt: new Date(jobWindow.startsAt.getTime() - travelBufferMs),
              },
            },
          })
        : Promise.resolve([]),
    ]);
    return calculateAvailability({
      rules: rules.map(toCalculatorRule),
      exceptions: exceptions.map((item) => ({
        startsAt: item.starts_at,
        endsAt: item.ends_at,
      })),
      assignments: assignments.flatMap((item) =>
        item.agreed_starts_at && item.agreed_ends_at
          ? [{ startsAt: item.agreed_starts_at, endsAt: item.agreed_ends_at }]
          : [],
      ),
      jobWindow,
      minCoverage,
      travelBufferMinutes,
    });
  }

  async getPublicSlots(
    userId: string,
    fromInput: string,
    toInput: string,
    viewerUserId?: string,
  ) {
    if (viewerUserId && (await this.blocks.between(viewerUserId, userId)))
      throw new NotFoundException();
    const from = new Date(fromInput);
    const to = new Date(toInput);
    if (to <= from) {
      throw new BadRequestException("Slot range end must be after its start.");
    }
    if (to.getTime() - from.getTime() > 31 * 24 * 60 * 60_000) {
      throw new BadRequestException("Slot range cannot exceed 31 days.");
    }
    // Slots exist to book upcoming work, not to reconstruct someone's past
    // whereabouts. A day of slack covers clock and timezone differences.
    if (to.getTime() < this.now().getTime() - 24 * 60 * 60_000) {
      throw new BadRequestException("Slots are only shown for upcoming dates.");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deleted_at: null, role_modes: { has: "WORKER" } },
      select: { id: true, profile: { select: { discoverable: true } } },
    });
    if (!user) throw new NotFoundException();
    // A worker hidden from the directory is only bookable by people already
    // dealing with them.
    if (
      user.profile?.discoverable === false &&
      viewerUserId !== userId &&
      !(viewerUserId && (await this.engagement.engaged(viewerUserId, userId)))
    )
      throw new NotFoundException();

    const slots = await this.freeSlots(userId, from, to);
    return { userId, from: from.toISOString(), to: to.toISOString(), slots };
  }

  /**
   * Free windows from a person's weekly availability rules, minus their
   * exceptions, their booked assignments and any `extraBlocked` windows
   * (e.g. an expert's scheduled sessions). Used for booking a worker and,
   * P3.2, a consultation with an expert.
   */
  /** 403 ROLE_REQUIRED (WORKER) unless the user is an approved mentor. */
  async assertApprovedMentor(userId: string): Promise<void> {
    const approved = await this.prisma.profile.count({
      where: { user_id: userId, mentor_status: MentorStatus.APPROVED },
    });
    if (!approved) throw roleRequiredError(RoleMode.WORKER);
  }

  async freeSlots(
    userId: string,
    from: Date,
    to: Date,
    extraBlocked: Array<{ startsAt: Date; endsAt: Date }> = [],
    // A caller holding a lock passes its transaction, so the reads use it.
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Array<{ startsAt: string; endsAt: string }>> {
    const [rules, exceptions, assignments] = await Promise.all([
      db.availabilityRule.findMany({
        where: { user_id: userId, is_active: true },
        orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
      }),
      db.availabilityException.findMany({
        where: {
          user_id: userId,
          starts_at: { lt: to },
          ends_at: { gt: from },
        },
      }),
      db.assignment.findMany({
        where: {
          worker_user_id: userId,
          status: { in: BLOCKING_ASSIGNMENT_STATUSES },
          agreed_starts_at: { not: null, lt: to },
          agreed_ends_at: { not: null, gt: from },
        },
        select: { agreed_starts_at: true, agreed_ends_at: true },
      }),
    ]);

    const blocked = [
      ...extraBlocked,
      ...exceptions.map((item) => ({
        startsAt: item.starts_at,
        endsAt: item.ends_at,
      })),
      ...assignments.flatMap((item) =>
        item.agreed_starts_at && item.agreed_ends_at
          ? [{ startsAt: item.agreed_starts_at, endsAt: item.agreed_ends_at }]
          : [],
      ),
    ];
    const slots: Array<{ startsAt: string; endsAt: string }> = [];
    const cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
    );
    while (cursor < to) {
      for (const rule of rules) {
        if (rule.day_of_week !== cursor.getUTCDay()) continue;
        const start = withUtcTime(cursor, rule.start_time);
        const end = withUtcTime(cursor, rule.end_time);
        if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
        const clippedStart = start < from ? from : start;
        const clippedEnd = end > to ? to : end;
        for (const available of subtractWindows(
          { startsAt: clippedStart, endsAt: clippedEnd },
          blocked,
        )) {
          if (available.endsAt > available.startsAt) {
            slots.push({
              startsAt: available.startsAt.toISOString(),
              endsAt: available.endsAt.toISOString(),
            });
          }
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return slots;
  }
}

function withUtcTime(day: Date, time: Date): Date {
  const localWallClock = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    time.getUTCHours(),
    time.getUTCMinutes(),
  );
  return new Date(localWallClock - DHAKA_OFFSET_MINUTES * 60_000);
}

function subtractWindows(
  window: TimeWindow,
  blocked: TimeWindow[],
): TimeWindow[] {
  return blocked
    .filter(
      (item) => item.startsAt < window.endsAt && item.endsAt > window.startsAt,
    )
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
    .reduce<TimeWindow[]>(
      (remaining, item) => {
        return remaining.flatMap((part) => {
          if (item.startsAt >= part.endsAt || item.endsAt <= part.startsAt) {
            return [part];
          }
          const split: TimeWindow[] = [];
          if (item.startsAt > part.startsAt) {
            split.push({ startsAt: part.startsAt, endsAt: item.startsAt });
          }
          if (item.endsAt < part.endsAt) {
            split.push({ startsAt: item.endsAt, endsAt: part.endsAt });
          }
          return split;
        });
      },
      [window],
    );
}

function toCalculatorRule(rule: {
  day_of_week: number;
  start_time: Date;
  end_time: Date;
}): AvailabilityRuleInput {
  return {
    dayOfWeek: rule.day_of_week,
    startMinute:
      rule.start_time.getUTCHours() * 60 + rule.start_time.getUTCMinutes(),
    endMinute: rule.end_time.getUTCHours() * 60 + rule.end_time.getUTCMinutes(),
  };
}

function parseTime(value: string): Date {
  const [hour, minute] = value.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, hour, minute));
}

function formatTime(value: Date): string {
  return `${value.getUTCHours().toString().padStart(2, "0")}:${value
    .getUTCMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function mapException(exception: {
  id: string;
  starts_at: Date;
  ends_at: Date;
  reason: string | null;
}) {
  return {
    id: exception.id,
    startsAt: exception.starts_at.toISOString(),
    endsAt: exception.ends_at.toISOString(),
    reason: exception.reason,
  };
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AssignmentStatus } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AvailabilityRuleInput,
  calculateAvailability,
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
  constructor(private readonly prisma: PrismaService) {}

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

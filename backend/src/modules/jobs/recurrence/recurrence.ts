import { BadRequestException } from "@nestjs/common";
import { type Prisma } from "@prisma/client";

import { type RecurrenceRuleDto } from "../dto/jobs.dto";

export type RecurrenceRule = Readonly<{
  frequency: "DAILY" | "WEEKLY";
  daysOfWeek: readonly number[];
  startDate: string;
  startTime: string;
  endTime: string;
  until?: string;
  count?: number;
  timezone: "Asia/Dhaka";
}>;

export type GeneratedOccurrence = Readonly<{
  sequenceNo: number;
  scheduledDate: Date;
  startsAt: Date;
  endsAt: Date;
}>;

const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3_600_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseRecurrenceRule(value: Prisma.JsonValue): RecurrenceRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("A valid recurrence rule is required.");
  }
  const raw = value as Record<string, unknown>;
  const frequency = raw.frequency;
  const startDate = raw.startDate;
  const startTime = raw.startTime;
  const endTime = raw.endTime;
  const timezone = raw.timezone;
  const until = raw.until;
  const count = raw.count;
  if (frequency !== "DAILY" && frequency !== "WEEKLY") {
    throw new BadRequestException(
      "Recurrence frequency must be DAILY or WEEKLY.",
    );
  }
  if (
    typeof startDate !== "string" ||
    !validDateOnly(startDate) ||
    typeof startTime !== "string" ||
    !TIME_PATTERN.test(startTime) ||
    typeof endTime !== "string" ||
    !TIME_PATTERN.test(endTime) ||
    timezone !== "Asia/Dhaka"
  ) {
    throw new BadRequestException(
      "The recurrence date, time, or timezone is invalid.",
    );
  }
  if ((until === undefined) === (count === undefined)) {
    throw new BadRequestException(
      "Provide exactly one recurrence end: until or count.",
    );
  }
  if (
    until !== undefined &&
    (typeof until !== "string" || !validDateOnly(until))
  ) {
    throw new BadRequestException("Recurrence until must be a valid date.");
  }
  if (typeof until === "string" && until < startDate) {
    throw new BadRequestException(
      "Recurrence until cannot precede its start date.",
    );
  }
  if (
    count !== undefined &&
    (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 365)
  ) {
    throw new BadRequestException(
      "Recurrence count must be between 1 and 365.",
    );
  }
  const rawDays = raw.daysOfWeek;
  if (rawDays !== undefined && !Array.isArray(rawDays)) {
    throw new BadRequestException("Recurrence weekdays must be an array.");
  }
  const days = [...new Set((rawDays as unknown[] | undefined) ?? [])];
  if (
    days.some(
      (day) => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6,
    )
  ) {
    throw new BadRequestException(
      "Recurrence weekdays must be numbers from 0 to 6.",
    );
  }
  if (frequency === "WEEKLY" && days.length === 0) {
    throw new BadRequestException(
      "Weekly recurrence requires at least one weekday.",
    );
  }
  if (frequency === "DAILY" && days.length > 0) {
    throw new BadRequestException("Daily recurrence cannot specify weekdays.");
  }
  if (minutes(endTime) <= minutes(startTime)) {
    throw new BadRequestException(
      "Recurrence end time must be after start time.",
    );
  }
  return {
    frequency,
    daysOfWeek: days.map(Number).sort((a, b) => a - b),
    startDate,
    startTime,
    endTime,
    ...(typeof until === "string" ? { until } : {}),
    ...(typeof count === "number" ? { count } : {}),
    timezone,
  };
}

export function recurrenceRuleJson(
  input: RecurrenceRuleDto,
): Prisma.InputJsonObject {
  const parsed = parseRecurrenceRule(input as unknown as Prisma.JsonObject);
  return {
    frequency: parsed.frequency,
    daysOfWeek: [...parsed.daysOfWeek],
    startDate: parsed.startDate,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    ...(parsed.until ? { until: parsed.until } : {}),
    ...(parsed.count ? { count: parsed.count } : {}),
    timezone: parsed.timezone,
  };
}

export function generateOccurrences(
  rule: RecurrenceRule,
  through: Date,
): GeneratedOccurrence[] {
  const startDay = dateOnlyMs(rule.startDate);
  const untilDay = rule.until
    ? dateOnlyMs(rule.until)
    : Number.POSITIVE_INFINITY;
  const throughDay = through.getTime() + DHAKA_OFFSET_MS;
  const result: GeneratedOccurrence[] = [];
  let occurrenceCount = 0;
  for (
    let day = startDay;
    day <= untilDay && day <= throughDay;
    day += DAY_MS
  ) {
    const date = new Date(day);
    const occurs =
      rule.frequency === "DAILY" || rule.daysOfWeek.includes(date.getUTCDay());
    if (!occurs) continue;
    occurrenceCount += 1;
    if (rule.count !== undefined && occurrenceCount > rule.count) break;
    const dateText = date.toISOString().slice(0, 10);
    result.push({
      sequenceNo: Math.floor((day - startDay) / DAY_MS) + 1,
      scheduledDate: new Date(`${dateText}T00:00:00.000Z`),
      startsAt: dhakaInstant(dateText, rule.startTime),
      endsAt: dhakaInstant(dateText, rule.endTime),
    });
  }
  return result;
}

function dhakaInstant(date: string, time: string): Date {
  return new Date(dateOnlyMs(date) + minutes(time) * 60_000 - DHAKA_OFFSET_MS);
}

function minutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return hour * 60 + minute;
}

function dateOnlyMs(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function validDateOnly(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

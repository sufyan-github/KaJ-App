export const DHAKA_OFFSET_MINUTES = 6 * 60;

export interface AvailabilityRuleInput {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface TimeWindow {
  startsAt: Date;
  endsAt: Date;
}

export interface AvailabilityConflict extends TimeWindow {
  type: "ASSIGNMENT";
}

export interface AvailabilityInput {
  rules: readonly AvailabilityRuleInput[];
  exceptions?: readonly TimeWindow[];
  assignments?: readonly TimeWindow[];
  jobWindow?: TimeWindow;
  minCoverage: number;
  travelBufferMinutes?: number;
}

export interface AvailabilityResult {
  isAvailable: boolean;
  coverage: number | null;
  conflicts: AvailabilityConflict[];
}

interface Interval {
  start: number;
  end: number;
}

export function calculateAvailability(
  input: AvailabilityInput,
): AvailabilityResult {
  if (!input.jobWindow) {
    return { isAvailable: true, coverage: null, conflicts: [] };
  }
  const job = toInterval(input.jobWindow);
  if (job.end <= job.start)
    throw new Error("Job window must have positive duration.");
  if (input.minCoverage < 0 || input.minCoverage > 1) {
    throw new Error("Minimum coverage must be between zero and one.");
  }

  const conflicts = assignmentConflicts(
    job,
    input.assignments ?? [],
    input.travelBufferMinutes ?? 30,
  );
  if (input.rules.length === 0) {
    return {
      isAvailable: conflicts.length === 0,
      coverage: null,
      conflicts,
    };
  }

  const available = expandRules(input.rules, job);
  const exceptions = (input.exceptions ?? []).map(toInterval);
  const covered = subtractIntervals(
    intersectIntervals(available, job),
    exceptions,
  );
  const coveredMs = covered.reduce(
    (total, interval) => total + interval.end - interval.start,
    0,
  );
  const coverage = clamp(coveredMs / (job.end - job.start));
  return {
    isAvailable: coverage >= input.minCoverage && conflicts.length === 0,
    coverage,
    conflicts,
  };
}

export function calculateRecurringAvailability(
  input: Omit<AvailabilityInput, "jobWindow">,
  occurrences: readonly TimeWindow[],
): { isAvailable: boolean; results: AvailabilityResult[] } {
  const nextFour = occurrences.slice(0, 4);
  if (nextFour.length !== 4)
    throw new Error("Exactly four future occurrences are required.");
  const results = nextFour.map((jobWindow) =>
    calculateAvailability({ ...input, jobWindow }),
  );
  return {
    isAvailable: results.filter((result) => result.isAvailable).length >= 3,
    results,
  };
}

function expandRules(
  rules: readonly AvailabilityRuleInput[],
  job: Interval,
): Interval[] {
  const localStart = job.start + DHAKA_OFFSET_MINUTES * 60_000;
  const localEnd = job.end + DHAKA_OFFSET_MINUTES * 60_000;
  const firstDay = startOfUtcDay(localStart) - 86_400_000;
  const lastDay = startOfUtcDay(localEnd);
  const intervals: Interval[] = [];
  for (let localDay = firstDay; localDay <= lastDay; localDay += 86_400_000) {
    const dayOfWeek = new Date(localDay).getUTCDay();
    for (const rule of rules) {
      validateRule(rule);
      if (rule.dayOfWeek !== dayOfWeek) continue;
      const start =
        localDay + rule.startMinute * 60_000 - DHAKA_OFFSET_MINUTES * 60_000;
      let end =
        localDay + rule.endMinute * 60_000 - DHAKA_OFFSET_MINUTES * 60_000;
      if (rule.endMinute <= rule.startMinute) end += 86_400_000;
      intervals.push({ start, end });
    }
  }
  return mergeIntervals(intervals);
}

function assignmentConflicts(
  job: Interval,
  assignments: readonly TimeWindow[],
  bufferMinutes: number,
): AvailabilityConflict[] {
  if (bufferMinutes < 0) throw new Error("Travel buffer cannot be negative.");
  const buffer = bufferMinutes * 60_000;
  return assignments.flatMap((assignment) => {
    const interval = toInterval(assignment);
    if (
      interval.end + buffer <= job.start ||
      interval.start - buffer >= job.end
    ) {
      return [];
    }
    return [{ type: "ASSIGNMENT" as const, ...assignment }];
  });
}

function intersectIntervals(
  intervals: readonly Interval[],
  window: Interval,
): Interval[] {
  return mergeIntervals(
    intervals.flatMap((interval) => {
      const start = Math.max(interval.start, window.start);
      const end = Math.min(interval.end, window.end);
      return end > start ? [{ start, end }] : [];
    }),
  );
}

function subtractIntervals(
  intervals: readonly Interval[],
  removals: readonly Interval[],
): Interval[] {
  let result = [...intervals];
  for (const removal of mergeIntervals(removals)) {
    result = result.flatMap((interval) => {
      if (removal.end <= interval.start || removal.start >= interval.end)
        return [interval];
      const pieces: Interval[] = [];
      if (removal.start > interval.start) {
        pieces.push({ start: interval.start, end: removal.start });
      }
      if (removal.end < interval.end) {
        pieces.push({ start: removal.end, end: interval.end });
      }
      return pieces;
    });
  }
  return result;
}

function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (!last || interval.start > last.end) merged.push({ ...interval });
    else last.end = Math.max(last.end, interval.end);
  }
  return merged;
}

function validateRule(rule: AvailabilityRuleInput): void {
  if (
    !Number.isInteger(rule.dayOfWeek) ||
    rule.dayOfWeek < 0 ||
    rule.dayOfWeek > 6
  ) {
    throw new Error("Day of week must be an integer from zero through six.");
  }
  for (const minute of [rule.startMinute, rule.endMinute]) {
    if (!Number.isInteger(minute) || minute < 0 || minute >= 1_440) {
      throw new Error("Rule minutes must be integers within a day.");
    }
  }
}

function toInterval(window: TimeWindow): Interval {
  return { start: window.startsAt.getTime(), end: window.endsAt.getTime() };
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

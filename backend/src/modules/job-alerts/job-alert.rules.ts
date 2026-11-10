export const MAX_JOB_ALERTS = 10;
export const MAX_ALERT_NOTIFICATIONS_PER_JOB = 500;

export interface JobAlertFilters {
  categoryId?: string;
  skillId?: string;
  locationId?: string;
}

export interface AlertableJob {
  category_id: string;
  subcategory_id: string | null;
  location_id: string;
  skills: ReadonlyArray<{ skill_id: string }>;
}

/** Keeps only known string filters, so stored JSON compares predictably. */
export function normalizeAlertFilters(value: unknown): JobAlertFilters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const source = value as Record<string, unknown>;
  const filters: JobAlertFilters = {};
  for (const key of ["categoryId", "skillId", "locationId"] as const) {
    const item = source[key];
    if (typeof item === "string" && item.length > 0) filters[key] = item;
  }
  return filters;
}

export function hasAnyFilter(filters: JobAlertFilters): boolean {
  return Boolean(filters.categoryId || filters.skillId || filters.locationId);
}

export function sameAlertFilters(
  a: JobAlertFilters,
  b: JobAlertFilters,
): boolean {
  return (
    (a.categoryId ?? null) === (b.categoryId ?? null) &&
    (a.skillId ?? null) === (b.skillId ?? null) &&
    (a.locationId ?? null) === (b.locationId ?? null)
  );
}

/** Every filter that is set must match; an alert with no filters never matches. */
export function alertMatchesJob(
  filters: JobAlertFilters,
  job: AlertableJob,
): boolean {
  if (!hasAnyFilter(filters)) return false;
  if (
    filters.categoryId &&
    filters.categoryId !== job.category_id &&
    filters.categoryId !== job.subcategory_id
  ) {
    return false;
  }
  if (
    filters.skillId &&
    !job.skills.some((skill) => skill.skill_id === filters.skillId)
  ) {
    return false;
  }
  if (filters.locationId && filters.locationId !== job.location_id) {
    return false;
  }
  return true;
}

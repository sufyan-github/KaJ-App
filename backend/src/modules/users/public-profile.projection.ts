export interface PublicProfileSource {
  id: string;
  displayName: string;
  photoUrl: string | null;
  area: { nameEn: string; nameBn: string } | null;
  latitude: number | null;
  longitude: number | null;
  trustLevel: string;
  ratingAverage: string;
  ratingCount: number;
  completedJobsCount: number;
  skills: Array<{
    id: string;
    nameEn: string;
    nameBn: string;
    level: string;
    isVerified: boolean;
  }>;
  availabilityStartMinutes: readonly number[];
}

export function createPublicProfileProjection(source: PublicProfileSource) {
  return {
    id: source.id,
    displayName: maskPublicDisplayName(source.displayName),
    photoUrl: source.photoUrl,
    area: source.area,
    location:
      source.latitude === null || source.longitude === null
        ? null
        : {
            latitude: roundCoordinateToApprox500m(source.latitude),
            longitude: roundCoordinateToApprox500m(source.longitude),
          },
    trustLevel: source.trustLevel,
    ratingAverage: source.ratingAverage,
    ratingCount: source.ratingCount,
    completedJobsCount: source.completedJobsCount,
    skills: source.skills,
    availability: coarseAvailability(source.availabilityStartMinutes),
  };
}

export function maskPublicDisplayName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${Array.from(parts[1]!)[0]?.toUpperCase() ?? ""}.`;
}

export function roundCoordinateToApprox500m(value: number): number {
  return Number((Math.round(value / 0.005) * 0.005).toFixed(3));
}

function coarseAvailability(startMinutes: readonly number[]): string[] {
  const labels = new Set<string>();
  for (const minute of startMinutes) {
    if (minute < 6 * 60) labels.add("OVERNIGHT");
    else if (minute < 12 * 60) labels.add("MORNING");
    else if (minute < 18 * 60) labels.add("AFTERNOON");
    else labels.add("EVENING");
  }
  return [...labels];
}

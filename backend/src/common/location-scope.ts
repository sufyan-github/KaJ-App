import { Prisma } from "@prisma/client";

/**
 * W13: a location filter that also matches everything under it: an area,
 * or a thana's areas, or a city's thanas and areas (the tree is three deep).
 */
export function withinLocation(
  locationId: string | undefined,
): Prisma.LocationWhereInput | undefined {
  if (!locationId) return undefined;
  return {
    OR: [
      { id: locationId },
      { parent_id: locationId },
      { parent: { parent_id: locationId } },
    ],
  };
}

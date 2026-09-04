const EARTH_RADIUS_M = 6_371_000;

export interface Coordinates {
  lat: number;
  lng: number;
}

export function distanceMetres(from: Coordinates, to: Coordinates): number {
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const deltaLat = radians(to.lat - from.lat);
  const deltaLng = radians(to.lng - from.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(haversine));
}

export function isInsideGeofence(distanceM: number, radiusM: number): boolean {
  return Number.isFinite(distanceM) && distanceM <= radiusM;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

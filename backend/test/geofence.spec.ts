import {
  distanceMetres,
  isInsideGeofence,
} from "../src/modules/attendance/geofence";

describe("attendance geofence", () => {
  const job = { lat: 24.3745, lng: 88.6042 };
  const pointNorth = (metres: number) => ({
    lat: job.lat + (metres / 6_371_000) * (180 / Math.PI),
    lng: job.lng,
  });

  it("accepts 299 metres and rejects 301 metres for a 300 metre radius", () => {
    const inside = distanceMetres(job, pointNorth(299));
    const outside = distanceMetres(job, pointNorth(301));

    expect(inside).toBeCloseTo(299, 5);
    expect(outside).toBeCloseTo(301, 5);
    expect(isInsideGeofence(inside, 300)).toBe(true);
    expect(isInsideGeofence(outside, 300)).toBe(false);
  });

  it("includes the exact boundary", () => {
    expect(isInsideGeofence(300, 300)).toBe(true);
  });
});

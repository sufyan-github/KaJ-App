import {
  createPublicProfileProjection,
  maskPublicDisplayName,
  roundCoordinateToApprox500m,
} from "../src/modules/users/public-profile.projection";

describe("D10 public profile projection", () => {
  it("masks a full display name to first name and initial", () => {
    expect(maskPublicDisplayName("Rahim Uddin Ahmed")).toBe("Rahim U.");
    expect(maskPublicDisplayName("শিরিন")).toBe("শিরিন");
  });

  it("rounds coordinates to approximately 500 metre cells", () => {
    expect(roundCoordinateToApprox500m(24.37421)).toBe(24.375);
    expect(roundCoordinateToApprox500m(88.60412)).toBe(88.605);
  });

  it("contains only D10-public fields and coarse availability", () => {
    const result = createPublicProfileProjection({
      id: "worker-id",
      displayName: "Rahim Uddin",
      photoUrl: "https://signed.test/photo",
      area: { nameEn: "Talaimari", nameBn: "তালাইমারি" },
      latitude: 24.37421,
      longitude: 88.60412,
      trustLevel: "PHONE",
      ratingAverage: "4.70",
      ratingCount: 12,
      completedJobsCount: 8,
      skills: [],
      availabilityStartMinutes: [5 * 60, 9 * 60, 15 * 60, 19 * 60],
    });

    expect(result).toMatchObject({
      displayName: "Rahim U.",
      location: { latitude: 24.375, longitude: 88.605 },
      availability: ["OVERNIGHT", "MORNING", "AFTERNOON", "EVENING"],
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "phone",
      "email",
      "exactAddress",
      "document",
      "photoKey",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

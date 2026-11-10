import { RoleMode, TrustLevel } from "@prisma/client";

import { profileCompleteness } from "../src/modules/users/profile-completeness";

const empty = {
  hasPhoto: false,
  hasBio: false,
  hasArea: false,
  skillCount: 0,
  trustLevel: TrustLevel.PHONE,
  validCertificateCount: 0,
};

describe("profile completeness", () => {
  it("weights the worker checklist and lists every missing item in order", () => {
    expect(
      profileCompleteness({ ...empty, activeRole: RoleMode.WORKER }),
    ).toEqual({
      percent: 0,
      missing: ["PHOTO", "BIO", "AREA", "SKILLS", "IDENTITY", "TRAINING"],
    });
    expect(
      profileCompleteness({
        activeRole: RoleMode.WORKER,
        hasPhoto: true,
        hasBio: true,
        hasArea: true,
        skillCount: 2,
        trustLevel: TrustLevel.SKILL,
        validCertificateCount: 1,
      }),
    ).toEqual({ percent: 100, missing: [] });
    expect(
      profileCompleteness({
        ...empty,
        activeRole: RoleMode.WORKER,
        skillCount: 1,
        validCertificateCount: 1,
      }),
    ).toEqual({
      percent: 35,
      missing: ["PHOTO", "BIO", "AREA", "IDENTITY"],
    });
  });

  it("uses the customer checklist for customer and business modes", () => {
    for (const activeRole of [RoleMode.CUSTOMER, RoleMode.BUSINESS]) {
      expect(
        profileCompleteness({
          ...empty,
          activeRole,
          hasArea: true,
          hasBio: true,
          skillCount: 3,
          validCertificateCount: 2,
        }),
      ).toEqual({ percent: 40, missing: ["PHOTO", "IDENTITY"] });
    }
    expect(
      profileCompleteness({
        ...empty,
        activeRole: RoleMode.CUSTOMER,
        hasPhoto: true,
        hasArea: true,
        trustLevel: TrustLevel.IDENTITY,
      }).percent,
    ).toBe(100);
  });
});

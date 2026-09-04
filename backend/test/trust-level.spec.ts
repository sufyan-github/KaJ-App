import { TrustLevel, VerificationKind } from "@prisma/client";

import {
  hasTrust,
  highestTrust,
  prerequisiteFor,
  trustForVerification,
} from "../src/modules/verification/trust-level";

describe("verification trust progression", () => {
  it("maps verification kinds and prerequisites through the trust ladder", () => {
    expect(trustForVerification(VerificationKind.IDENTITY)).toBe(
      TrustLevel.IDENTITY,
    );
    expect(prerequisiteFor(VerificationKind.IDENTITY)).toBe(TrustLevel.PHONE);
    expect(prerequisiteFor(VerificationKind.SKILL)).toBe(TrustLevel.IDENTITY);
    expect(prerequisiteFor(VerificationKind.BUSINESS)).toBe(TrustLevel.SKILL);
  });

  it("never downgrades an existing trust level", () => {
    expect(highestTrust(TrustLevel.SKILL, TrustLevel.PHONE)).toBe(
      TrustLevel.SKILL,
    );
    expect(highestTrust(TrustLevel.PHONE, TrustLevel.IDENTITY)).toBe(
      TrustLevel.IDENTITY,
    );
    expect(hasTrust(TrustLevel.BUSINESS, TrustLevel.IDENTITY)).toBe(true);
    expect(hasTrust(TrustLevel.PHONE, TrustLevel.IDENTITY)).toBe(false);
  });
});

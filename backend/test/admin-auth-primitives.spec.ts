import {
  decryptTotpSecret,
  encryptTotpSecret,
  totpCode,
  verifyTotp,
} from "../src/modules/admin-auth/admin-auth.primitives";

describe("admin authentication primitives", () => {
  it("matches the RFC 6238 SHA-1 vector at 59 seconds", () => {
    expect(totpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1)).toBe("287082");
  });

  it("accepts the adjacent clock window and rejects other codes", () => {
    const now = new Date(1_700_000_000_000);
    const counter = Math.floor(now.getTime() / 30_000);
    expect(
      verifyTotp(
        "JBSWY3DPEHPK3PXP",
        totpCode("JBSWY3DPEHPK3PXP", counter - 1),
        now,
      ),
    ).toBe(counter - 1);
    expect(verifyTotp("JBSWY3DPEHPK3PXP", "000000", now)).toBeNull();
  });

  it("encrypts TOTP secrets with authenticated encryption", () => {
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", "test-key");
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptTotpSecret(encrypted, "test-key")).toBe("JBSWY3DPEHPK3PXP");
    expect(() => decryptTotpSecret(encrypted, "wrong-key")).toThrow();
  });
});

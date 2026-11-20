import { adminSeedDecision } from "../prisma/seed-admin";

const LOCAL = "postgresql://kaj:x@127.0.0.1:5432/kaj";
const REMOTE = "postgresql://kaj:x@db.render.internal:5432/kaj";

/** SEC-1: the seed never creates a publicly known admin login. */
describe("admin seed guard", () => {
  it("skips the admin when no password or TOTP secret is given", () => {
    expect(
      adminSeedDecision({ NODE_ENV: "development", DATABASE_URL: LOCAL }),
    ).toEqual({
      seed: false,
      reason: expect.stringContaining("ADMIN_SEED_PASSWORD"),
    });
    expect(
      adminSeedDecision({
        NODE_ENV: "test",
        DATABASE_URL: LOCAL,
        ADMIN_SEED_PASSWORD: "a-real-password-1",
      }),
    ).toMatchObject({ seed: false });
  });

  it("refuses in production", () => {
    expect(() =>
      adminSeedDecision({
        NODE_ENV: "production",
        DATABASE_URL: LOCAL,
        ADMIN_SEED_PASSWORD: "a-real-password-1",
        ADMIN_SEED_TOTP_SECRET: "ABCDEFGHIJKLMNOP",
      }),
    ).toThrow(/production/);
  });

  it("allows the committed example values only against a local database", () => {
    const committed = {
      NODE_ENV: "development",
      ADMIN_SEED_PASSWORD: "KajAdminLocal123!",
      ADMIN_SEED_TOTP_SECRET: "JBSWY3DPEHPK3PXP",
    };
    expect(
      adminSeedDecision({ ...committed, DATABASE_URL: LOCAL }),
    ).toMatchObject({
      seed: true,
    });
    expect(() =>
      adminSeedDecision({ ...committed, DATABASE_URL: REMOTE }),
    ).toThrow(/committed example/);
    // Explicit, non-example credentials are fine anywhere outside production.
    expect(
      adminSeedDecision({
        NODE_ENV: "development",
        DATABASE_URL: REMOTE,
        ADMIN_SEED_EMAIL: "ops@example.org",
        ADMIN_SEED_PASSWORD: "a-real-password-1",
        ADMIN_SEED_TOTP_SECRET: "ABCDEFGHIJKLMNOP",
      }),
    ).toEqual({
      seed: true,
      email: "ops@example.org",
      password: "a-real-password-1",
      totpSecret: "ABCDEFGHIJKLMNOP",
    });
  });

  it("never puts a secret in its messages", () => {
    try {
      adminSeedDecision({
        NODE_ENV: "development",
        DATABASE_URL: REMOTE,
        ADMIN_SEED_PASSWORD: "KajAdminLocal123!",
        ADMIN_SEED_TOTP_SECRET: "JBSWY3DPEHPK3PXP",
      });
    } catch (error) {
      expect(String(error)).not.toMatch(/KajAdminLocal123!|JBSWY3DPEHPK3PXP/);
    }
  });
});

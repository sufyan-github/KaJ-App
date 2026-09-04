import { validateEnvironment } from "../src/config/environment";

describe("environment validation", () => {
  it("applies safe local defaults", () => {
    const environment = validateEnvironment({});

    expect(environment.NODE_ENV).toBe("development");
    expect(environment.PORT).toBe(3000);
    expect(environment.DEFAULT_TIMEZONE).toBe("Asia/Dhaka");
    expect(environment.OTP_HASH_SECRET).toBe("");
  });

  it("requires long authentication secrets in production", () => {
    expect(() =>
      validateEnvironment({
        JWT_ACCESS_SECRET: "short",
        JWT_REFRESH_SECRET: "short",
        NODE_ENV: "production",
      }),
    ).toThrow("Invalid environment configuration");
  });

  it("accepts production when all authentication secrets are long enough", () => {
    const environment = validateEnvironment({
      ADMIN_SESSION_SECRET: "c".repeat(32),
      ADMIN_TOTP_ENCRYPTION_KEY: "d".repeat(32),
      JWT_ACCESS_SECRET: "a".repeat(32),
      JWT_REFRESH_SECRET: "b".repeat(32),
      OTP_HASH_SECRET: "e".repeat(32),
      NODE_ENV: "production",
      SMS_PROVIDER: "disabled",
    });

    expect(environment.NODE_ENV).toBe("production");
  });

  it("accepts a six-digit fixed OTP only outside production", () => {
    expect(
      validateEnvironment({ OTP_FIXED_CODE: "123456" }).OTP_FIXED_CODE,
    ).toBe("123456");
    expect(() => validateEnvironment({ OTP_FIXED_CODE: "12345" })).toThrow(
      "OTP_FIXED_CODE",
    );
    expect(() =>
      validateEnvironment({
        ADMIN_SESSION_SECRET: "c".repeat(32),
        ADMIN_TOTP_ENCRYPTION_KEY: "d".repeat(32),
        JWT_ACCESS_SECRET: "a".repeat(32),
        JWT_REFRESH_SECRET: "b".repeat(32),
        OTP_HASH_SECRET: "e".repeat(32),
        NODE_ENV: "production",
        OTP_FIXED_CODE: "123456",
        SMS_PROVIDER: "disabled",
      }),
    ).toThrow("OTP_FIXED_CODE");
  });
});

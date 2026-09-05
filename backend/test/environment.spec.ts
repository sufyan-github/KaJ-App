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

  it("requires the private gateway URL and HMAC key for bdapps", () => {
    expect(() => validateEnvironment({ SMS_PROVIDER: "bdapps" })).toThrow(
      "BDAPPS_GATEWAY_URL",
    );
    expect(() =>
      validateEnvironment({
        BDAPPS_GATEWAY_URL: "https://gateway.example/api",
        BDAPPS_INTERNAL_API_KEY: "short",
        SMS_PROVIDER: "bdapps",
      }),
    ).toThrow("BDAPPS_INTERNAL_API_KEY");
    expect(
      validateEnvironment({
        BDAPPS_GATEWAY_URL: "http://127.0.0.1:8766/api",
        BDAPPS_INTERNAL_API_KEY: "a".repeat(64),
        OPERATOR_PROVIDER: "bdapps",
      }).OPERATOR_PROVIDER,
    ).toBe("bdapps");
  });
});

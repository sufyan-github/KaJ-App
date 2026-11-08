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

  it("refuses blank secrets on a deployed non-production server", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        API_BASE_URL: "https://api-staging.kaaj.app",
      }),
    ).toThrow("outside local development");
  });

  it("keeps the development fallbacks for localhost and tests", () => {
    expect(() =>
      validateEnvironment({ API_BASE_URL: "http://127.0.0.1:3100" }),
    ).not.toThrow();
    expect(() =>
      validateEnvironment({
        NODE_ENV: "test",
        API_BASE_URL: "https://ci.example",
      }),
    ).not.toThrow();
  });

  it("parses the trusted proxy hop count", () => {
    expect(validateEnvironment({}).TRUST_PROXY_HOPS).toBe(0);
    expect(
      validateEnvironment({ TRUST_PROXY_HOPS: "1" }).TRUST_PROXY_HOPS,
    ).toBe(1);
    expect(() => validateEnvironment({ TRUST_PROXY_HOPS: "-1" })).toThrow();
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

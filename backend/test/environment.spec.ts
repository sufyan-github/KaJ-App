import { validateEnvironment } from "../src/config/environment";

describe("environment validation", () => {
  it("applies safe local defaults", () => {
    const environment = validateEnvironment({});

    expect(environment.NODE_ENV).toBe("development");
    expect(environment.PORT).toBe(3000);
    expect(environment.DEFAULT_TIMEZONE).toBe("Asia/Dhaka");
  });

  it("requires long JWT secrets in production", () => {
    expect(() =>
      validateEnvironment({
        JWT_ACCESS_SECRET: "short",
        JWT_REFRESH_SECRET: "short",
        NODE_ENV: "production",
      }),
    ).toThrow("Invalid environment configuration");
  });

  it("accepts production when both JWT secrets are long enough", () => {
    const environment = validateEnvironment({
      JWT_ACCESS_SECRET: "a".repeat(32),
      JWT_REFRESH_SECRET: "b".repeat(32),
      NODE_ENV: "production",
    });

    expect(environment.NODE_ENV).toBe("production");
  });
});

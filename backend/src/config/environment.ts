import { z } from "zod";

const environmentSchema = z
  .object({
    API_BASE_URL: z.url().default("http://localhost:3000"),
    ADMIN_SESSION_SECRET: z.string().default(""),
    ADMIN_TOTP_ENCRYPTION_KEY: z.string().default(""),
    BDAPPS_GATEWAY_URL: z.union([z.literal(""), z.url()]).default(""),
    BDAPPS_INTERNAL_API_KEY: z.string().default(""),
    DATABASE_URL: z
      .string()
      .min(1)
      .default("postgresql://kaj:kaj_local_only@localhost:5432/kaj"),
    DEFAULT_LOCALE: z.enum(["bn", "en"]).default("bn"),
    DEFAULT_TIMEZONE: z.literal("Asia/Dhaka").default("Asia/Dhaka"),
    FCM_SERVICE_ACCOUNT_JSON_PATH: z.string().default(""),
    JWT_ACCESS_SECRET: z.string().default(""),
    JWT_ACCESS_TTL: z.string().min(1).default("15m"),
    JWT_REFRESH_SECRET: z.string().default(""),
    JWT_REFRESH_TTL: z.string().min(1).default("30d"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_FIXED_CODE: z
      .union([z.literal(""), z.string().regex(/^\d{6}$/)])
      .default(""),
    OTP_HASH_SECRET: z.string().default(""),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(60),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    PAYMENT_PROVIDER: z.literal("manual").default("manual"),
    PLATFORM_FEE_DEFAULT_BPS: z.coerce
      .number()
      .int()
      .min(0)
      .max(10_000)
      .default(800),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    S3_BUCKET: z.string().default("kaj-local"),
    S3_ENDPOINT: z.string().default("http://localhost:9000"),
    S3_KEY: z.string().default("kaj_minio"),
    S3_REGION: z.string().default("ap-south-1"),
    S3_SECRET: z.string().default("kaj_minio_local_only"),
    SENTRY_DSN: z.string().default(""),
    SMS_PROVIDER: z.enum(["console", "disabled", "bdapps"]).default("console"),
    OPERATOR_PROVIDER: z.enum(["pending", "bdapps"]).default("pending"),
    STORAGE_PROVIDER: z.literal("s3").default("s3"),
    PUSH_PROVIDER: z.literal("disabled").default("disabled"),
  })
  .superRefine((environment, context) => {
    const usesBdapps =
      environment.SMS_PROVIDER === "bdapps" ||
      environment.OPERATOR_PROVIDER === "bdapps";

    if (usesBdapps) {
      if (environment.BDAPPS_GATEWAY_URL === "") {
        context.addIssue({
          code: "custom",
          message: "is required when a bdapps provider is enabled",
          path: ["BDAPPS_GATEWAY_URL"],
        });
      }
      if (environment.BDAPPS_INTERNAL_API_KEY.length < 32) {
        context.addIssue({
          code: "custom",
          message: "must contain at least 32 characters when bdapps is enabled",
          path: ["BDAPPS_INTERNAL_API_KEY"],
        });
      }
    }

    if (environment.NODE_ENV !== "production") return;

    for (const key of [
      "JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET",
      "OTP_HASH_SECRET",
      "ADMIN_SESSION_SECRET",
      "ADMIN_TOTP_ENCRYPTION_KEY",
    ] as const) {
      if (environment[key].length < 32) {
        context.addIssue({
          code: "custom",
          message: "must contain at least 32 characters in production",
          path: [key],
        });
      }
    }
    if (environment.SMS_PROVIDER === "console") {
      context.addIssue({
        code: "custom",
        message: "console SMS is not allowed in production",
        path: ["SMS_PROVIDER"],
      });
    }
    if (usesBdapps && !environment.BDAPPS_GATEWAY_URL.startsWith("https://")) {
      context.addIssue({
        code: "custom",
        message: "must use HTTPS in production",
        path: ["BDAPPS_GATEWAY_URL"],
      });
    }
    if (environment.OTP_FIXED_CODE !== "") {
      context.addIssue({
        code: "custom",
        message: "fixed OTP is not allowed in production",
        path: ["OTP_FIXED_CODE"],
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues
      .map(
        (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
      )
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return result.data;
}

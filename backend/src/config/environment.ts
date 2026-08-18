import { z } from "zod";

const environmentSchema = z
  .object({
    API_BASE_URL: z.url().default("http://localhost:3000"),
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
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(60),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    PAYMENT_PROVIDER: z.string().min(1).default("manual"),
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
    SMS_PROVIDER: z.string().min(1).default("console"),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== "production") return;

    for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
      if (environment[key].length < 32) {
        context.addIssue({
          code: "custom",
          message: "must contain at least 32 characters in production",
          path: [key],
        });
      }
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

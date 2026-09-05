import { ConfigService } from "@nestjs/config";

import { validateEnvironment } from "../src/config/environment";
import { Clock } from "../src/common/time/clock";
import { ManualPaymentAdapter } from "../src/infra/payment/manual.adapter";
import { DisabledPushAdapter } from "../src/infra/push/disabled.adapter";
import { ConsoleSmsAdapter } from "../src/infra/sms/console.adapter";
import { DisabledSmsAdapter } from "../src/infra/sms/disabled.adapter";
import { selectSmsAdapter } from "../src/infra/sms/sms.provider";
import { S3StorageAdapter } from "../src/infra/storage/s3.adapter";
import { PendingOperatorAdapter } from "../src/infra/operator/pending.adapter";

describe("provider-neutral adapter ports", () => {
  const fixedClock: Clock = {
    now: () => new Date("2026-08-23T12:00:00.000Z"),
  };

  it("selects SMS behavior entirely inside infra and rejects unknown providers", () => {
    const consoleAdapter = new ConsoleSmsAdapter();
    const disabledAdapter = new DisabledSmsAdapter();

    expect(selectSmsAdapter("console", consoleAdapter, disabledAdapter)).toBe(
      consoleAdapter,
    );
    expect(selectSmsAdapter("disabled", consoleAdapter, disabledAdapter)).toBe(
      disabledAdapter,
    );
    expect(() =>
      selectSmsAdapter("unknown", consoleAdapter, disabledAdapter),
    ).toThrow("Unsupported SMS provider");
  });

  it("forbids the development console SMS adapter in production", () => {
    expect(() =>
      validateEnvironment({
        JWT_ACCESS_SECRET: "a".repeat(32),
        JWT_REFRESH_SECRET: "b".repeat(32),
        NODE_ENV: "production",
        SMS_PROVIDER: "console",
      }),
    ).toThrow("SMS_PROVIDER");
  });

  it("fails explicitly when push delivery has no configured provider", async () => {
    const adapter = new DisabledPushAdapter();

    await expect(
      adapter.send({
        bodyKey: "notification.application.body",
        data: { jobId: "job-id" },
        dedupeKey: "application:job-id:user-id",
        titleKey: "notification.application.title",
        userId: "user-id",
      }),
    ).rejects.toThrow("Push delivery is not configured");
  });

  it("creates a local S3-compatible signed upload without network access", async () => {
    const adapter = new S3StorageAdapter(
      new ConfigService({
        S3_BUCKET: "kaj-local",
        S3_ENDPOINT: "http://localhost:9000",
        S3_KEY: "kaj_minio",
        S3_REGION: "ap-south-1",
        S3_SECRET: "kaj_minio_local_only",
      }),
      fixedClock,
    );

    const signed = await adapter.createUploadUrl({
      contentType: "image/jpeg",
      expiresInSeconds: 300,
      key: "profile/user-id/photo.jpg",
      sizeBytes: 1024,
    });

    expect(signed.key).toBe("profile/user-id/photo.jpg");
    expect(signed.uploadUrl).toContain("localhost:9000/kaj-local/profile");
    expect(signed.uploadUrl).toContain("X-Amz-Signature");
    expect(signed.expiresAt.toISOString()).toBe("2026-08-23T12:05:00.000Z");
  });

  it("rejects unsafe object keys before signing", async () => {
    const adapter = new S3StorageAdapter(
      new ConfigService({
        S3_BUCKET: "kaj-local",
        S3_ENDPOINT: "http://localhost:9000",
        S3_KEY: "kaj_minio",
        S3_REGION: "ap-south-1",
        S3_SECRET: "kaj_minio_local_only",
      }),
      fixedClock,
    );

    await expect(
      adapter.createUploadUrl({
        contentType: "image/jpeg",
        expiresInSeconds: 300,
        key: "../private/document.jpg",
        sizeBytes: 1024,
      }),
    ).rejects.toThrow("Unsafe storage object key");
  });

  it("keeps manual payments pending and cannot fabricate capture or refund", async () => {
    const adapter = new ManualPaymentAdapter();
    const created = await adapter.createCharge({
      amountPoisha: 10_000,
      assignmentId: "assignment-id",
      currency: "BDT",
      idempotencyKey: "idempotency-key",
      payerId: "payer-id",
    });

    expect(created.status).toBe("PENDING");
    expect(await adapter.getStatus(created.providerReference)).toEqual(
      expect.objectContaining({ status: "PENDING" }),
    );
    await expect(
      adapter.capture({
        amountPoisha: 10_000,
        providerReference: created.providerReference,
      }),
    ).rejects.toThrow("Manual payment capture is not supported");
    await expect(
      adapter.refund({
        amountPoisha: 10_000,
        providerReference: created.providerReference,
        reason: "CUSTOMER_APPROVED",
      }),
    ).rejects.toThrow("Manual payment refunds are not supported");
    await expect(
      adapter.verifyWebhook({ body: Buffer.from("{}"), headers: {} }),
    ).resolves.toEqual({ valid: false });
  });

  it("never treats an operator prefix as verified or charged", async () => {
    const adapter = new PendingOperatorAdapter();

    await expect(
      adapter.checkEligibility({
        operatorCode: "ROBI",
        phoneE164: "+8801812345678",
      }),
    ).resolves.toEqual({
      operatorCode: "ROBI",
      providerReference: null,
      status: "PENDING",
    });
  });
});

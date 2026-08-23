import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { CLOCK, Clock } from "../../common/time/clock";
import {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  SignedDownload,
  SignedUpload,
  StoragePort,
} from "./storage.port";

@Injectable()
export class S3StorageAdapter implements StoragePort {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(
    config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.getOrThrow<string>("S3_KEY"),
        secretAccessKey: config.getOrThrow<string>("S3_SECRET"),
      },
      endpoint: config.getOrThrow<string>("S3_ENDPOINT"),
      forcePathStyle: true,
      region: config.getOrThrow<string>("S3_REGION"),
    });
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<SignedUpload> {
    validateObjectKey(input.key);
    validateExpiry(input.expiresInSeconds);
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
      throw new Error("Storage object size must be a positive integer");
    }
    if (!input.contentType.includes("/")) {
      throw new Error("Storage content type is invalid");
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      ContentLength: input.sizeBytes,
      ContentType: input.contentType,
      Key: input.key,
    });
    const now = this.clock.now();
    return {
      expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1_000),
      key: input.key,
      requiredHeaders: { "content-type": input.contentType },
      uploadUrl: await getSignedUrl(this.client, command, {
        expiresIn: input.expiresInSeconds,
        signingDate: now,
      }),
    };
  }

  async createDownloadUrl(
    input: CreateDownloadUrlInput,
  ): Promise<SignedDownload> {
    validateObjectKey(input.key);
    validateExpiry(input.expiresInSeconds);
    const now = this.clock.now();
    return {
      downloadUrl: await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: input.key }),
        { expiresIn: input.expiresInSeconds, signingDate: now },
      ),
      expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1_000),
      key: input.key,
    };
  }

  async deleteObject(key: string): Promise<void> {
    validateObjectKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

function validateObjectKey(key: string): void {
  const segments = key.split("/");
  if (
    key.length === 0 ||
    key.length > 1_024 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Unsafe storage object key");
  }
}

function validateExpiry(expiresInSeconds: number): void {
  if (
    !Number.isSafeInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > 900
  ) {
    throw new Error("Storage URL expiry must be between 1 and 900 seconds");
  }
}

import { randomUUID } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import sharp from "sharp";

import { KajHttpException } from "../../common/errors/kaj-http.exception";
import { STORAGE_PORT, StoragePort } from "../../infra/storage/storage.port";

/**
 * Upload purpose TRAINING_STEP_IMAGE (admin only): a picture for one lesson
 * step. JPEG, PNG or WebP up to 300 KB and 1600 px on each side; stored
 * re-encoded as WebP without metadata under `training/steps/`, with its size
 * in the key (`<uuid>-<width>x<height>.webp`).
 */
export const STEP_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type StepImageMime = (typeof STEP_IMAGE_MIME_TYPES)[number];
export const STEP_IMAGE_MAX_BYTES = 300 * 1024;
export const STEP_IMAGE_MAX_PX = 1600;
const UPLOAD_EXPIRY_SECONDS = 5 * 60;
const PREVIEW_EXPIRY_SECONDS = 5 * 60;
const EXTENSION: Record<StepImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const FORMAT: Record<StepImageMime, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

const error = (code: string, messageKey: string, message: string) =>
  new KajHttpException(
    {
      action: null,
      code,
      details: [],
      field: null,
      message,
      messageKey,
      retryable: false,
    },
    HttpStatus.BAD_REQUEST,
  );

const requestInvalid = (message: string) =>
  new KajHttpException(
    {
      action: null,
      code: "UPLOAD_REQUEST_INVALID",
      details: [],
      field: null,
      message,
      messageKey: "error.upload.request_invalid",
      retryable: false,
    },
    HttpStatus.BAD_REQUEST,
  );

export const trainingImageInvalid = (message: string) =>
  new KajHttpException(
    {
      action: null,
      code: "TRAINING_IMAGE_INVALID",
      details: [],
      field: null,
      message,
      messageKey: "error.training.image_invalid",
      retryable: false,
    },
    HttpStatus.BAD_REQUEST,
  );

const tooLarge = () =>
  new KajHttpException(
    {
      action: null,
      code: "TRAINING_IMAGE_TOO_LARGE",
      details: [],
      field: null,
      message: `A step picture can be at most ${STEP_IMAGE_MAX_PX} px wide and high.`,
      messageKey: "error.training.image_too_large",
      retryable: false,
    },
    HttpStatus.BAD_REQUEST,
  );

@Injectable()
export class TrainingStepImagesService {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  private pendingPrefix(adminUserId: string) {
    return `private/pending/training-steps/${adminUserId}/`;
  }

  async sign(
    adminUserId: string,
    input: { mime: StepImageMime; sizeBytes: number },
  ) {
    this.assertRequest(input.mime, input.sizeBytes);
    const key = `${this.pendingPrefix(adminUserId)}${randomUUID()}.${EXTENSION[input.mime]}`;
    const signed = await this.storage.createUploadUrl({
      contentType: input.mime,
      expiresInSeconds: UPLOAD_EXPIRY_SECONDS,
      key,
      sizeBytes: input.sizeBytes,
    });
    return { ...signed, expiresIn: UPLOAD_EXPIRY_SECONDS };
  }

  async complete(
    adminUserId: string,
    input: { key: string; mime: StepImageMime; sizeBytes: number },
  ) {
    this.assertRequest(input.mime, input.sizeBytes);
    if (
      !input.key.startsWith(this.pendingPrefix(adminUserId)) ||
      input.key.includes("..")
    )
      throw requestInvalid("This upload key does not belong to you.");
    const metadata = await this.storage.getObjectMetadata(input.key);
    if (
      metadata.sizeBytes !== input.sizeBytes ||
      metadata.contentType !== input.mime
    )
      throw error(
        "UPLOAD_METADATA_MISMATCH",
        "error.upload.metadata_mismatch",
        "Uploaded object metadata does not match the signed request.",
      );
    const body = await this.storage.readObject(input.key);
    let info: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    try {
      info = await sharp(body, { failOn: "warning" }).metadata();
    } catch {
      throw trainingImageInvalid("The file is not a readable picture.");
    }
    if (info.format !== FORMAT[input.mime] || !info.width || !info.height)
      throw trainingImageInvalid(
        "The file is not a JPEG, PNG or WebP picture of the stated type.",
      );
    if (info.width > STEP_IMAGE_MAX_PX || info.height > STEP_IMAGE_MAX_PX)
      throw tooLarge();
    // Re-encoding drops EXIF and other metadata; rotate() applies orientation.
    const { data, info: output } = await sharp(body)
      .rotate()
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    const imageKey = `training/steps/${randomUUID()}-${output.width}x${output.height}.webp`;
    await this.storage.writeObject({
      body: data,
      contentType: "image/webp",
      key: imageKey,
    });
    await this.storage.deleteObject(input.key);
    return {
      imageKey,
      previewUrl: await this.url(imageKey, PREVIEW_EXPIRY_SECONDS),
      width: output.width,
      height: output.height,
    };
  }

  /** A signed URL for a stored step picture. */
  async url(imageKey: string, expiresInSeconds: number) {
    return (
      await this.storage.createDownloadUrl({ expiresInSeconds, key: imageKey })
    ).downloadUrl;
  }

  async signedImage(imageKey: string, expiresInSeconds: number) {
    const signed = await this.storage.createDownloadUrl({
      expiresInSeconds,
      key: imageKey,
    });
    return { url: signed.downloadUrl, expiresAt: signed.expiresAt };
  }

  async exists(imageKey: string): Promise<boolean> {
    try {
      await this.storage.getObjectMetadata(imageKey);
      return true;
    } catch {
      return false;
    }
  }

  async remove(imageKey: string): Promise<void> {
    try {
      await this.storage.deleteObject(imageKey);
    } catch {
      // Already gone; nothing else refers to it.
    }
  }

  private assertRequest(mime: string, sizeBytes: number) {
    if (!(STEP_IMAGE_MIME_TYPES as readonly string[]).includes(mime))
      throw requestInvalid(
        `MIME type ${mime} is not allowed for step pictures.`,
      );
    if (
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 1 ||
      sizeBytes > STEP_IMAGE_MAX_BYTES
    )
      throw requestInvalid(
        `A step picture must be between 1 and ${STEP_IMAGE_MAX_BYTES} bytes.`,
      );
  }
}

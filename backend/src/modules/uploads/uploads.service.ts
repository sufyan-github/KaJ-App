import { randomUUID } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { STORAGE_PORT, StoragePort } from "../../infra/storage/storage.port";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { CompleteUploadDto, SignUploadDto } from "./dto/upload.dto";
import { ImageProcessor } from "./image.processor";
import {
  extensionForMime,
  getUploadPolicy,
  validateUploadRequest,
} from "./upload.policy";
import { uploadError } from "./upload.errors";

const UPLOAD_EXPIRY_SECONDS = 5 * 60;
const DOWNLOAD_EXPIRY_SECONDS = 60;

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageProcessor,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async sign(userId: string, input: SignUploadDto) {
    try {
      validateUploadRequest(input.kind, input.mime, input.sizeBytes);
    } catch (error) {
      throw uploadError(
        "UPLOAD_REQUEST_INVALID",
        "error.upload.request_invalid",
        (error as Error).message,
      );
    }
    const key = `private/pending/${userId}/${randomUUID()}.${extensionForMime(input.mime)}`;
    const signed = await this.storage.createUploadUrl({
      contentType: input.mime,
      expiresInSeconds: UPLOAD_EXPIRY_SECONDS,
      key,
      sizeBytes: input.sizeBytes,
    });
    return { ...signed, expiresIn: UPLOAD_EXPIRY_SECONDS };
  }

  async complete(userId: string, input: CompleteUploadDto) {
    this.assertOwnedPendingKey(userId, input.key);
    try {
      validateUploadRequest(input.kind, input.mime, input.sizeBytes);
    } catch (error) {
      throw uploadError(
        "UPLOAD_REQUEST_INVALID",
        "error.upload.request_invalid",
        (error as Error).message,
      );
    }
    const metadata = await this.storage.getObjectMetadata(input.key);
    if (
      metadata.sizeBytes !== input.sizeBytes ||
      metadata.contentType !== input.mime
    ) {
      throw uploadError(
        "UPLOAD_METADATA_MISMATCH",
        "error.upload.metadata_mismatch",
        "Uploaded object metadata does not match the signed request.",
      );
    }
    const body = await this.storage.readObject(input.key);
    if (body.byteLength !== input.sizeBytes) {
      throw uploadError(
        "UPLOAD_SIZE_MISMATCH",
        "error.upload.size_mismatch",
        "Uploaded object size is invalid.",
      );
    }

    if (input.mime === "application/pdf") {
      if (!startsWithPdfMagic(body)) this.throwMimeSpoof();
      return this.saveDocument(userId, input, body, "application/pdf");
    }

    let processed;
    try {
      processed = await this.images.inspectAndProcess(body);
    } catch {
      this.throwMimeSpoof();
    }
    if (processed.detectedMime !== input.mime) this.throwMimeSpoof();

    if (input.kind === "PROFILE_PHOTO") {
      const base = `profile/${userId}/${randomUUID()}`;
      const keys = await Promise.all(
        processed.variants.map(async (variant) => {
          const key = `${base}/${variant.name}.webp`;
          await this.storage.writeObject({
            body: variant.body,
            contentType: "image/webp",
            key,
          });
          return { name: variant.name, key };
        }),
      );
      const largeKey = keys.find((item) => item.name === "large")!.key;
      await this.prisma.profile.update({
        where: { user_id: userId },
        data: { photo_key: largeKey },
      });
      await this.storage.deleteObject(input.key);
      return {
        key: largeKey,
        variants: Object.fromEntries(keys.map((item) => [item.name, item.key])),
      };
    }
    return this.saveDocument(userId, input, processed.sanitized, "image/webp");
  }

  async createDocumentDownload(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, user_id: userId, deleted_at: null },
    });
    if (!document) throw new NotFoundException();
    const signed = await this.storage.createDownloadUrl({
      expiresInSeconds: DOWNLOAD_EXPIRY_SECONDS,
      key: document.storage_key,
    });
    return { ...signed, expiresIn: DOWNLOAD_EXPIRY_SECONDS };
  }

  private async saveDocument(
    userId: string,
    input: CompleteUploadDto,
    body: Uint8Array,
    mime: string,
  ) {
    const key = `private/documents/${userId}/${randomUUID()}.${extensionForMime(mime)}`;
    await this.storage.writeObject({ body, contentType: mime, key });
    const document = await this.prisma.document.create({
      data: {
        user_id: userId,
        kind: input.kind,
        storage_key: key,
        mime,
        size_bytes: body.byteLength,
        is_sensitive: getUploadPolicy(input.kind).sensitive,
      },
    });
    await this.storage.deleteObject(input.key);
    return { documentId: document.id, mime, sizeBytes: body.byteLength };
  }

  private assertOwnedPendingKey(userId: string, key: string): void {
    if (!key.startsWith(`private/pending/${userId}/`)) {
      throw uploadError(
        "UPLOAD_KEY_INVALID",
        "error.upload.key_invalid",
        "Upload key is invalid.",
      );
    }
  }

  private throwMimeSpoof(): never {
    throw uploadError(
      "UPLOAD_CONTENT_INVALID",
      "error.upload.content_invalid",
      "Uploaded bytes do not match the declared MIME type.",
    );
  }
}

function startsWithPdfMagic(body: Uint8Array): boolean {
  return (
    body.byteLength >= 5 &&
    Buffer.from(body.subarray(0, 5)).toString("ascii") === "%PDF-"
  );
}

import { validate } from "class-validator";
import sharp from "sharp";

import { PrismaService } from "../src/infra/prisma/prisma.service";
import {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  StoragePort,
  WriteObjectInput,
} from "../src/infra/storage/storage.port";
import { SignUploadDto } from "../src/modules/uploads/dto/upload.dto";
import { ImageProcessor } from "../src/modules/uploads/image.processor";
import { UploadsService } from "../src/modules/uploads/uploads.service";

class MemoryStorage implements StoragePort {
  readonly objects = new Map<
    string,
    { body: Uint8Array; contentType: string }
  >();
  readonly downloads: string[] = [];

  async createUploadUrl(input: CreateUploadUrlInput) {
    return {
      expiresAt: new Date("2026-09-01T12:05:00Z"),
      key: input.key,
      requiredHeaders: { "content-type": input.contentType },
      uploadUrl: `https://storage.test/upload/${input.key}`,
    };
  }

  async createDownloadUrl(input: CreateDownloadUrlInput) {
    this.downloads.push(input.key);
    return {
      downloadUrl: `https://storage.test/private/${input.key}?expires=${input.expiresInSeconds}`,
      expiresAt: new Date("2026-09-01T12:01:00Z"),
      key: input.key,
    };
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async getObjectMetadata(key: string) {
    const object = this.objects.get(key)!;
    return {
      contentType: object.contentType,
      sizeBytes: object.body.byteLength,
    };
  }

  async readObject(key: string): Promise<Uint8Array> {
    return this.objects.get(key)!.body;
  }

  async writeObject(input: WriteObjectInput): Promise<void> {
    this.objects.set(input.key, {
      body: input.body,
      contentType: input.contentType,
    });
  }
}

describe("UploadsService", () => {
  const userId = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f701";
  const profileUpdate = jest.fn();
  const documentCreate = jest.fn();
  const documentFindFirst = jest.fn();
  const prisma = {
    profile: { update: profileUpdate },
    document: { create: documentCreate, findFirst: documentFindFirst },
  } as unknown as PrismaService;
  let storage: MemoryStorage;
  let service: UploadsService;

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new MemoryStorage();
    service = new UploadsService(prisma, new ImageProcessor(), storage);
    profileUpdate.mockResolvedValue({});
    documentCreate.mockResolvedValue({ id: "document-id" });
  });

  it("rejects an oversize request with an actionable message key", async () => {
    await expect(
      service.sign(userId, {
        kind: "PROFILE_PHOTO",
        mime: "image/jpeg",
        sizeBytes: 10 * 1024 * 1024 + 1,
      }),
    ).rejects.toMatchObject({
      descriptor: { messageKey: "error.upload.request_invalid" },
    });
  });

  it("rejects a MIME type outside the selected kind policy", async () => {
    const dto = Object.assign(new SignUploadDto(), {
      kind: "PROFILE_PHOTO",
      mime: "application/x-msdownload",
      sizeBytes: 100,
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it("returns a five-minute signed upload constrained by content type", async () => {
    const result = await service.sign(userId, {
      kind: "PROFILE_PHOTO",
      mime: "image/jpeg",
      sizeBytes: 100,
    });
    expect(result).toMatchObject({
      expiresIn: 300,
      requiredHeaders: { "content-type": "image/jpeg" },
    });
    expect(result.key).toContain(`private/pending/${userId}/`);
  });

  it("rejects spoofed bytes even when the object header says JPEG", async () => {
    const key = `private/pending/${userId}/spoof.jpg`;
    const body = Buffer.from("MZ executable bytes");
    storage.objects.set(key, { body, contentType: "image/jpeg" });
    await expect(
      service.complete(userId, {
        key,
        kind: "PROFILE_PHOTO",
        mime: "image/jpeg",
        sizeBytes: body.byteLength,
      }),
    ).rejects.toMatchObject({
      descriptor: { messageKey: "error.upload.content_invalid" },
    });
  });

  it("removes EXIF and writes three verified photo variants", async () => {
    const original = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 3,
        background: "#ff0000",
      },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: "GPS-bearing test source" } })
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const key = `private/pending/${userId}/photo.jpg`;
    storage.objects.set(key, { body: original, contentType: "image/jpeg" });

    const result = await service.complete(userId, {
      key,
      kind: "PROFILE_PHOTO",
      mime: "image/jpeg",
      sizeBytes: original.byteLength,
    });

    if (!("variants" in result)) throw new Error("Expected a photo result");
    expect(Object.keys(result.variants)).toEqual(["small", "medium", "large"]);
    for (const variantKey of Object.values(result.variants)) {
      const variant = storage.objects.get(variantKey)!;
      expect(variant.contentType).toBe("image/webp");
      expect((await sharp(variant.body).metadata()).exif).toBeUndefined();
    }
    expect(storage.objects.has(key)).toBe(false);
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { user_id: userId },
      data: { photo_key: result.key },
    });
  });

  it("stores a verified PDF privately without returning its object key", async () => {
    const key = `private/pending/${userId}/identity.pdf`;
    const body = Buffer.from("%PDF-1.7\nprivate identity document");
    storage.objects.set(key, { body, contentType: "application/pdf" });
    const result = await service.complete(userId, {
      key,
      kind: "VERIFICATION_DOCUMENT",
      mime: "application/pdf",
      sizeBytes: body.byteLength,
    });
    expect(result).toEqual({
      documentId: "document-id",
      mime: "application/pdf",
      sizeBytes: body.byteLength,
    });
    expect(documentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        is_sensitive: true,
        storage_key: expect.stringContaining("private/documents/"),
      }),
    });
  });

  it("requires a fresh owner-authorized signed GET for a private document", async () => {
    documentFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      storage_key: `private/documents/${userId}/identity.pdf`,
    });

    await expect(
      service.createDocumentDownload("other-user", "document-id"),
    ).rejects.toThrow();
    expect(storage.downloads).toHaveLength(0);

    const result = await service.createDocumentDownload(userId, "document-id");
    expect(result.expiresIn).toBe(60);
    expect(result.downloadUrl).toContain("expires=60");
    expect(storage.downloads).toHaveLength(1);
  });
});

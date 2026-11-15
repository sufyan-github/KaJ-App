import {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  SignedDownload,
  SignedUpload,
  StoragePort,
  StoredObjectMetadata,
  WriteObjectInput,
} from "../../src/infra/storage/storage.port";

/**
 * In-memory StoragePort for HTTP tests, so upload flows run without S3.
 * `put()` stands in for the client's PUT to the presigned URL.
 */
export class MemoryStorage implements StoragePort {
  readonly objects = new Map<
    string,
    { body: Uint8Array; contentType: string }
  >();

  put(key: string, body: Uint8Array, contentType: string) {
    this.objects.set(key, { body, contentType });
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<SignedUpload> {
    return {
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      key: input.key,
      requiredHeaders: { "Content-Type": input.contentType },
      uploadUrl: `memory://upload/${input.key}`,
    };
  }

  async createDownloadUrl(
    input: CreateDownloadUrlInput,
  ): Promise<SignedDownload> {
    return {
      downloadUrl: `memory://download/${input.key}`,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      key: input.key,
    };
  }

  async deleteObject(key: string) {
    this.objects.delete(key);
  }

  async getObjectMetadata(key: string): Promise<StoredObjectMetadata> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`No object ${key}`);
    return {
      contentType: object.contentType,
      sizeBytes: object.body.byteLength,
    };
  }

  async readObject(key: string) {
    const object = this.objects.get(key);
    if (!object) throw new Error(`No object ${key}`);
    return object.body;
  }

  async writeObject(input: WriteObjectInput) {
    this.objects.set(input.key, {
      body: input.body,
      contentType: input.contentType,
    });
  }
}

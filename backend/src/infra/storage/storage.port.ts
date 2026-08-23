export const STORAGE_PORT = Symbol("STORAGE_PORT");

export interface CreateUploadUrlInput {
  contentType: string;
  expiresInSeconds: number;
  key: string;
  sizeBytes: number;
}

export interface CreateDownloadUrlInput {
  expiresInSeconds: number;
  key: string;
}

export interface SignedUpload {
  expiresAt: Date;
  key: string;
  requiredHeaders: Readonly<Record<string, string>>;
  uploadUrl: string;
}

export interface SignedDownload {
  downloadUrl: string;
  expiresAt: Date;
  key: string;
}

export interface StoragePort {
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<SignedDownload>;
  createUploadUrl(input: CreateUploadUrlInput): Promise<SignedUpload>;
  deleteObject(key: string): Promise<void>;
}

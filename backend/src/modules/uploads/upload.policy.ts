export const UPLOAD_KINDS = [
  "PROFILE_PHOTO",
  "VERIFICATION_DOCUMENT",
  "DISPUTE_EVIDENCE",
  "CHECKIN_PHOTO",
  "CHAT_IMAGE",
] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export interface UploadPolicy {
  allowedMimeTypes: readonly string[];
  maxSizeBytes: number;
  sensitive: boolean;
}

const POLICIES: Record<UploadKind, UploadPolicy> = {
  PROFILE_PHOTO: {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSizeBytes: 10 * 1024 * 1024,
    sensitive: false,
  },
  VERIFICATION_DOCUMENT: {
    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    maxSizeBytes: 15 * 1024 * 1024,
    sensitive: true,
  },
  DISPUTE_EVIDENCE: {
    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    maxSizeBytes: 15 * 1024 * 1024,
    sensitive: true,
  },
  CHECKIN_PHOTO: {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSizeBytes: 10 * 1024 * 1024,
    sensitive: true,
  },
  CHAT_IMAGE: {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSizeBytes: 5 * 1024 * 1024,
    sensitive: false,
  },
};

export function getUploadPolicy(kind: UploadKind): UploadPolicy {
  return POLICIES[kind];
}

export function validateUploadRequest(
  kind: UploadKind,
  mime: string,
  sizeBytes: number,
): void {
  const policy = getUploadPolicy(kind);
  if (!policy.allowedMimeTypes.includes(mime)) {
    throw new Error(`MIME type ${mime} is not allowed for ${kind}.`);
  }
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 1 ||
    sizeBytes > policy.maxSizeBytes
  ) {
    throw new Error(
      `Upload size must be between 1 and ${policy.maxSizeBytes} bytes.`,
    );
  }
}

export function extensionForMime(mime: string): string {
  return {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[mime]!;
}

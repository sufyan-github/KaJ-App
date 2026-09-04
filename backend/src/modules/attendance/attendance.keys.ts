import { BadRequestException } from "@nestjs/common";

export function requiredAttendanceKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length > 128) {
    throw new BadRequestException(
      "A valid Idempotency-Key header is required.",
    );
  }
  return key;
}

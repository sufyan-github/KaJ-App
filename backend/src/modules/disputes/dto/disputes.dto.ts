import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export const DISPUTE_REASON_CODES = [
  "NOT_COMPLETED",
  "POOR_QUALITY",
  "NO_SHOW",
  "OVERCHARGED",
  "UNSAFE_CONDITIONS",
  "DIFFERENT_SCOPE",
  "PAYMENT_NOT_RECEIVED",
  "HARASSMENT",
  "OTHER",
] as const;

export class OpenDisputeDto {
  @IsIn(DISPUTE_REASON_CODES)
  reasonCode!: (typeof DISPUTE_REASON_CODES)[number];

  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  description!: string;
}

export class AddDisputeEvidenceDto {
  @IsIn(["TEXT", "PHOTO", "DOCUMENT"])
  kind!: "TEXT" | "PHOTO" | "DOCUMENT";

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(4_000)
  text?: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;
}

export class AppealDisputeDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  reason!: string;
}

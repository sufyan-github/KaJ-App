import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ModerationLevel, ReportStatus } from "@prisma/client";

export const REPORT_TARGET_TYPES = [
  "USER",
  "JOB",
  "CONVERSATION",
  "ASSIGNMENT",
  "MESSAGE",
  // P2: Business & Ideas.
  "BUSINESS",
  "BUSINESS_OFFERING",
  "COLLABORATION_REQUEST",
  "IDEA",
  "IDEA_ROLE",
  // P3: Experts & Community.
  "INTRODUCTION",
  "SESSION",
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASON_CODES = [
  "HARASSMENT",
  "SCAM",
  "WAGE_THEFT",
  "UNSAFE_WORK",
  "DISCRIMINATION",
  "INAPPROPRIATE_CONTENT",
  "IMPERSONATION",
  "OFF_PLATFORM_PAYMENT",
  "NO_SHOW",
  "OTHER",
] as const;

export class CreateReportDto {
  @IsIn(REPORT_TARGET_TYPES)
  targetType!: ReportTargetType;

  @IsUUID()
  targetId!: string;

  @IsIn(REPORT_REASON_CODES)
  reasonCode!: (typeof REPORT_REASON_CODES)[number];

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description!: string;
}

export class ReportQueueQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  /** The last item id of the previous page (see `nextCursor`). */
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class ModerationDecisionDto {
  @IsIn([ReportStatus.ACTIONED, ReportStatus.DISMISSED])
  status!: ReportStatus;

  @IsOptional()
  @IsEnum(ModerationLevel)
  action?: ModerationLevel;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  durationDays?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  requireReverification?: boolean;

  /**
   * P2: hide the reported business, offering, idea, idea role or
   * collaboration request (with or without a user moderation level).
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  hideContent?: boolean;
}

export class DirectModerationDto {
  @IsEnum(ModerationLevel)
  action!: ModerationLevel;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  durationDays?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  requireReverification?: boolean;
}

export class ModerationReasonDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  ValidateNested,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import {
  ApplicationStatus,
  DisputeDecision,
  DisputeStatus,
  Gender,
  JobStatus,
  LocationType,
  UserStatus,
  VerificationKind,
  VerificationStatus,
} from "@prisma/client";

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** The last item id of the previous page (see `nextCursor`). */
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class AuditLogQueryDto extends PageQueryDto {
  @IsOptional()
  @Matches(/^[A-Z0-9_]{2,80}$/u)
  action?: string;

  @IsOptional()
  @Matches(/^[A-Z0-9_]{2,80}$/u)
  entity?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  actorEmail?: string;

  /** Inclusive start, ISO 8601. */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Exclusive end, ISO 8601. */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  /** Leave out the rows written by opening list views (`*_VIEWED`). */
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === "true",
  )
  @IsBoolean()
  changesOnly?: boolean;
}

export class DisputeQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;
}

export class UserQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class JobQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}

export class VerificationQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;

  /** e.g. MENTOR for the mentor approval queue. */
  @IsOptional()
  @IsEnum(VerificationKind)
  kind?: VerificationKind;
}

export class ReasonDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class UserActionDto extends ReasonDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}

export class ForceTransitionDto extends ReasonDto {
  @IsEnum(JobStatus)
  toStatus!: JobStatus;
}

export class FeatureJobDto extends ReasonDto {
  @IsBoolean()
  isFeatured!: boolean;
}

export class ApplicationActionDto extends ReasonDto {
  // R1 (A1): unstick only puts an application back to PENDING.
  @IsIn([ApplicationStatus.PENDING])
  status: ApplicationStatus = ApplicationStatus.PENDING;
}

export class VerificationDecisionDto extends ReasonDto {
  @IsEnum(VerificationStatus)
  status!: VerificationStatus;

  /** R7 B1: on an IDENTITY approval, the gender to record (default: declared). */
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}

/** R7 B1: support/admin correction of a verified person's gender. */
export class GenderCorrectionDto extends ReasonDto {
  @IsEnum(Gender)
  gender!: Gender;
}

export class SkillDto extends ReasonDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  slug!: string;

  @IsString()
  @MinLength(2)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  nameBn!: string;

  @IsBoolean()
  isActive = true;
}

export class SkillQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class CategoryDto extends ReasonDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  slug!: string;

  @IsString()
  @MinLength(2)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  nameBn!: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsInt()
  @Min(0)
  sortOrder = 0;

  @IsBoolean()
  isActive = true;

  @IsBoolean()
  requiresManualApproval = false;

  @IsInt()
  @Min(16)
  minAge = 18;

  @IsBoolean()
  requiresCertificate = false;

  @IsBoolean()
  requiresIdentity = false;

  @IsBoolean()
  requiresPosterIdentity = false;

  @IsInt()
  @Min(0)
  @Max(5)
  requiresReferences = 0;

  @IsBoolean()
  requiresLicence = false;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  safetyNotice?: string;

  @IsBoolean()
  unsafeForStudents = false;
}

export class LocationDto extends ReasonDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsEnum(LocationType)
  type!: LocationType;

  @IsString()
  @MinLength(2)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  nameBn!: string;

  /** Both or neither; inside Bangladesh (checked by the service). */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0.1)
  radiusKm?: number;

  @IsBoolean()
  isActive = true;
}

export class ConfigChangeDto extends ReasonDto {
  @IsObject()
  value!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;

  @IsBoolean()
  confirm = false;
}

export class FlagChangeDto extends ReasonDto {
  @IsBoolean()
  isEnabled!: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent!: number;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class DisputeResolutionDto extends ReasonDto {
  @IsEnum(DisputeDecision)
  decision!: DisputeDecision;

  @IsString()
  @MinLength(8)
  resolution!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  refundPoisha = 0;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  releasePoisha = 0;

  @IsOptional()
  @IsEnum(JobStatus)
  jobStatus?: JobStatus;
}

/**
 * Who a campaign goes to. Unknown keys are refused (400), so a typo can no
 * longer silently mean "everyone"; omitted keys mean "no filter".
 */
export class CampaignSegmentDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsIn(["CUSTOMER", "WORKER", "BUSINESS", "MENTOR"])
  role?: "CUSTOMER" | "WORKER" | "BUSINESS" | "MENTOR";

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  communityGroupId?: string;
}

export class CampaignDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @MinLength(2)
  body!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CampaignSegmentDto)
  segment!: CampaignSegmentDto;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  throttlePerMinute = 100;
}

/** Sending notifies real people, so it takes a typed reason. */
export class CampaignSendDto extends CampaignDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

/** A read-only view of one person's account is justified each time. */
export class ImpersonationQueryDto extends ReasonDto {}

export class EmailQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
}

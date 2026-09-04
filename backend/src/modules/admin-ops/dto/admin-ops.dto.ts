import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
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
  JobStatus,
  LocationType,
  UserStatus,
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
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus = ApplicationStatus.PENDING;
}

export class VerificationDecisionDto extends ReasonDto {
  @IsEnum(VerificationStatus)
  status!: VerificationStatus;
}

export class CategoryDto {
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

export class LocationDto {
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

  @IsOptional()
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @Type(() => Number)
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
  segment!: Record<string, unknown>;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  throttlePerMinute = 100;
}

export class EmailQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
}

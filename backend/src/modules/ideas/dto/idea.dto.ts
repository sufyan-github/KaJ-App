import { IsOptionalNotNull } from "../../../common/validation/optional-not-null";
import {
  BusinessStage,
  IdeaArrangement,
  IdeaRoleStatus,
  IdeaRoleType,
  IdeaStage,
  IdeaTimeCommitment,
  IdeaVisibility,
} from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

import { CursorQueryDto } from "../../../common/api/cursor-query.dto";

const OPEN_STAGES = [
  IdeaStage.CONCEPT,
  IdeaStage.VALIDATING,
  IdeaStage.PILOT,
] as const;

/** POST /ideas */
export class CreateIdeaDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  /** The one line anyone may see if the idea is SUMMARY_PUBLIC. */
  @IsString()
  @MinLength(10)
  @MaxLength(160)
  summary!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  problem!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  solution!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  details?: string;

  /** A business sector (GET /business-categories). */
  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsIn(OPEN_STAGES)
  stage?: (typeof OPEN_STAGES)[number];

  @IsOptional()
  @IsEnum(IdeaVisibility)
  visibility?: IdeaVisibility;

  @IsOptional()
  @IsBoolean()
  aiConsent?: boolean;
}

/** PATCH /ideas/:id — any subset; null clears details or the area. */
export class UpdateIdeaDto {
  @IsOptionalNotNull()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @IsOptionalNotNull()
  @IsString()
  @MinLength(10)
  @MaxLength(160)
  summary?: string;

  @IsOptionalNotNull()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  problem?: string;

  @IsOptionalNotNull()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  solution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  details?: string | null;

  @IsOptionalNotNull()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @IsOptionalNotNull()
  @IsIn(OPEN_STAGES)
  stage?: (typeof OPEN_STAGES)[number];

  @IsOptionalNotNull()
  @IsEnum(IdeaVisibility)
  visibility?: IdeaVisibility;

  @IsOptionalNotNull()
  @IsBoolean()
  aiConsent?: boolean;
}

/** GET /ideas — search returns public summaries only. */
export class IdeaSearchQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsIn(OPEN_STAGES)
  stage?: (typeof OPEN_STAGES)[number];

  /** Ideas seeking this kind of role. */
  @IsOptional()
  @IsEnum(IdeaRoleType)
  roleType?: IdeaRoleType;

  /** Words in the title or the public summary (never the private details). */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  q?: string;
}

/** POST /ideas/:id/access-requests */
export class RequestIdeaAccessDto {
  /** Must be true: the requester accepts the confidentiality notice. */
  @Equals(true)
  acceptConfidentiality!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class IdeaAccessListQueryDto {
  @IsOptional()
  @IsIn(["REQUESTED", "APPROVED", "DECLINED", "REVOKED"])
  status?: "REQUESTED" | "APPROVED" | "DECLINED" | "REVOKED";
}

/** POST /ideas/:id/roles */
export class CreateIdeaRoleDto {
  @IsEnum(IdeaRoleType)
  roleType!: IdeaRoleType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  /** Public on a SUMMARY_PUBLIC idea: keep confidential details out. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  skillIds!: string[];

  @IsEnum(IdeaTimeCommitment)
  timeCommitment!: IdeaTimeCommitment;

  @IsOptional()
  @IsEnum(IdeaArrangement)
  arrangement?: IdeaArrangement;
}

/** PATCH /ideas/:id/roles/:roleId */
export class UpdateIdeaRoleDto {
  @IsOptionalNotNull()
  @IsEnum(IdeaRoleType)
  roleType?: IdeaRoleType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  skillIds?: string[];

  @IsOptionalNotNull()
  @IsEnum(IdeaTimeCommitment)
  timeCommitment?: IdeaTimeCommitment;

  @IsOptionalNotNull()
  @IsEnum(IdeaArrangement)
  arrangement?: IdeaArrangement;

  @IsOptionalNotNull()
  @IsEnum(IdeaRoleStatus)
  status?: IdeaRoleStatus;
}

/** POST /ideas/:id/members — from an AGREED collaboration request. */
export class AddIdeaMemberDto {
  @IsUUID()
  collaborationRequestId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleLabel?: string;
}

const CONVERT_STAGES = [
  BusinessStage.INFORMAL,
  BusinessStage.REGISTERED,
] as const;

/** POST /ideas/:id/convert */
export class ConvertIdeaDto {
  @IsIn(CONVERT_STAGES)
  stage!: (typeof CONVERT_STAGES)[number];

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tradeLicenceNo?: string;
}

export class IdeaViewsQueryDto extends CursorQueryDto {}

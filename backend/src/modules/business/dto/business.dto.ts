import { BusinessMemberRole, BusinessStage } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { CursorQueryDto } from "../../../common/api/cursor-query.dto";

/** POST /businesses */
export class CreateBusinessDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEnum(BusinessStage)
  stage?: BusinessStage;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** A business sector (GET /business-categories). */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** The area it works in (a location id). */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tradeLicenceNo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  employeesCount?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  seekingPartners?: boolean;
}

/** PATCH /businesses/:id — any subset; null clears an optional field. */
export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(BusinessStage)
  stage?: BusinessStage;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactPerson?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tradeLicenceNo?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  employeesCount?: number | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  seekingPartners?: boolean;
}

/** POST /businesses/:id/members */
export class InviteBusinessMemberDto {
  @IsUUID()
  userId!: string;

  @IsEnum(BusinessMemberRole)
  role!: BusinessMemberRole;
}

/** PATCH /businesses/:id/members/:userId */
export class UpdateBusinessMemberDto {
  @IsEnum(BusinessMemberRole)
  role!: BusinessMemberRole;
}

/** GET /partners — public businesses that are looking for partners. */
export class PartnerDirectoryQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** An area, thana or the city: includes what lies inside it. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsEnum(BusinessStage)
  stage?: BusinessStage;

  /** Words in the name or description. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  q?: string;
}

/** POST /businesses/:id/verification — trade licence and other evidence. */
export class SubmitBusinessVerificationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsUUID("all", { each: true })
  documentIds!: string[];
}

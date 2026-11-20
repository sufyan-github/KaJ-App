import { IsOptionalNotNull } from "../../../common/validation/optional-not-null";
import { SkillLevel } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
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
  ValidateNested,
} from "class-validator";

import { CursorQueryDto } from "../../../common/api/cursor-query.dto";

export class MentorSkillDto {
  @IsUUID()
  skillId!: string;

  /** Used when the skill is not on the profile yet (default ADVANCED). */
  @IsOptional()
  @IsEnum(SkillLevel)
  level?: SkillLevel;
}

export class MentorApplicationDto {
  /** Skills to teach, with levels. Send this or `skillIds`. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MentorSkillDto)
  skills?: MentorSkillDto[];

  /** Shorthand for `skills` when levels don't matter (default ADVANCED). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  skillIds?: string[];

  /**
   * Accepted for app convenience and ignored: an approved mentor starts out
   * accepting learners and can pause with PUT /me/mentor.
   */
  @IsOptional()
  @IsBoolean()
  accepting?: boolean;

  /** What and how they teach, in their own words. */
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  bio!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(70)
  yearsExperience!: number;

  /** Skill evidence: uploaded VERIFICATION_DOCUMENTs (certificates, photos of work). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  documentIds!: string[];
}

export class UpdateMentorDto {
  @IsOptionalNotNull()
  @IsBoolean()
  accepting?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(70)
  yearsExperience?: number;
}

export class MentorDirectoryQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsUUID()
  skillId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

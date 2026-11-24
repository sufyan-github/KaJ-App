import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/** POST/PUT /admin/business-categories — the sector taxonomy. */
export class BusinessCategoryDto {
  /** The typed operational reason, kept in the audit row. */
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  @MaxLength(60)
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nameBn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminBusinessReasonDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

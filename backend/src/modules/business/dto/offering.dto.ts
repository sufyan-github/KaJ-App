import { IsOptionalNotNull } from "../../../common/validation/optional-not-null";
import { OfferingKind } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const MONEY = /^\d{1,15}$/;

/** POST /businesses/:id/offerings — at least one of titleEn / titleBn. */
export class CreateOfferingDto {
  @IsEnum(OfferingKind)
  kind!: OfferingKind;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleBn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Poisha as a decimal string. */
  @IsOptional()
  @Matches(MONEY)
  priceMinPoisha?: string;

  @IsOptional()
  @Matches(MONEY)
  priceMaxPoisha?: string;

  /** What the price is for, e.g. "per kg", "প্রতি ঘণ্টা". */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  priceUnit?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

/** PATCH …/offerings/:offeringId — any subset; null clears an optional field. */
export class UpdateOfferingDto {
  @IsOptionalNotNull()
  @IsEnum(OfferingKind)
  kind?: OfferingKind;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleBn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @Matches(MONEY)
  priceMinPoisha?: string | null;

  @IsOptional()
  @Matches(MONEY)
  priceMaxPoisha?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  priceUnit?: string | null;

  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;

  @IsOptionalNotNull()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

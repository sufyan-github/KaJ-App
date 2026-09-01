import { LocationType } from "@prisma/client";
import {
  IsBooleanString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CategoryQueryDto {
  @IsOptional()
  @IsBooleanString()
  tree?: string;
}

export class SkillQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class LocationQueryDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;
}

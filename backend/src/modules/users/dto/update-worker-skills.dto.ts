import { SkillLevel } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class WorkerSkillInputDto {
  @IsUUID()
  skillId!: string;

  @IsEnum(SkillLevel)
  level!: SkillLevel;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(80)
  years?: number;

  // Self-reported. Omitted keeps the stored answer.
  @IsOptional()
  @IsBoolean()
  hasPriorTraining?: boolean;
}

export class UpdateWorkerSkillsDto {
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => WorkerSkillInputDto)
  skills!: WorkerSkillInputDto[];
}

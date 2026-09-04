import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { RiskReviewStatus } from "@prisma/client";

export class RiskQueueQueryDto {
  @IsOptional()
  @IsIn([
    RiskReviewStatus.OPEN,
    RiskReviewStatus.UNDER_REVIEW,
    RiskReviewStatus.CLEARED,
    RiskReviewStatus.ESCALATED,
  ])
  status?: RiskReviewStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minScore = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class RiskScanDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class RiskDecisionDto {
  @IsIn([RiskReviewStatus.CLEARED, RiskReviewStatus.ESCALATED])
  status!: RiskReviewStatus;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

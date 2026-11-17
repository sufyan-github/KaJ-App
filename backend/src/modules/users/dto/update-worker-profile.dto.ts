import { WorkArrangement } from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";

const MIN_RATE_POISHA = 5_000;
const MAX_RATE_POISHA = 5_000_000;

export class UpdateWorkerProfileDto {
  @IsOptional()
  @IsInt()
  @Min(MIN_RATE_POISHA)
  @Max(MAX_RATE_POISHA)
  hourlyRatePoisha?: number | null;

  @IsOptional()
  @IsInt()
  @Min(MIN_RATE_POISHA)
  @Max(MAX_RATE_POISHA)
  dailyRatePoisha?: number | null;

  @IsOptional()
  @IsInt()
  @Min(MIN_RATE_POISHA)
  @Max(MAX_RATE_POISHA)
  monthlyRatePoisha?: number | null;

  /** P3.7: arrangements you want (the feed's "match my preferences"). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsEnum(WorkArrangement, { each: true })
  preferredArrangements?: WorkArrangement[];

  @IsOptional()
  @IsBoolean()
  prefersFlexibleHours?: boolean;
}

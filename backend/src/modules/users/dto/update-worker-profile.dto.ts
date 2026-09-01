import { IsInt, IsOptional, Max, Min } from "class-validator";

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
}

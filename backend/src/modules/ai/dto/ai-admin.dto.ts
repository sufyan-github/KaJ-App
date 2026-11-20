import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class AiUsageQueryDto {
  /** Days back including today (Asia/Dhaka calendar days). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days = 14;
}

import { Type } from "class-transformer";
import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

/**
 * `?cursor=<id of the last item you have>&limit=n`. Both optional: without
 * them a list returns its first page exactly as before. Responses carry
 * `nextCursor` (null on the last page).
 */
export class CursorQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

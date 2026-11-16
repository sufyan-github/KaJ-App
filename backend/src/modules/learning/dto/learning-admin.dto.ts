import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import { CursorQueryDto } from "../../../common/api/cursor-query.dto";

export class AdminReasonDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class AdminCertificateQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(["QUIZ", "PRACTICAL"])
  kind?: "QUIZ" | "PRACTICAL";

  /** Public code, or part of the holder's name. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

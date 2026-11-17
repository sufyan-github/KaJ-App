import { GroupMemberRole, SessionKind, SessionStatus } from "@prisma/client";
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import { CursorQueryDto } from "../../../common/api/cursor-query.dto";

export class AdminGroupQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(["ACTIVE", "HIDDEN"])
  status?: "ACTIVE" | "HIDDEN";

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  q?: string;
}

export class AdminSessionQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsEnum(SessionKind)
  kind?: SessionKind;

  @IsOptional()
  @IsIn(["true", "false"])
  hidden?: "true" | "false";
}

export class AdminGroupRoleDto {
  @IsEnum(GroupMemberRole)
  role!: GroupMemberRole;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

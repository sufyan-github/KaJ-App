import {
  GroupMemberRole,
  GroupMemberStatus,
  GroupVisibility,
} from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

import { CursorQueryDto } from "../../../common/api/cursor-query.dto";

/** POST /community/groups */
export class CreateGroupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(GroupVisibility)
  visibility?: GroupVisibility;

  /** Opt-in: members need a profile marked female and a moderator's approval. */
  @IsOptional()
  @IsBoolean()
  womenOnly?: boolean;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** A work category (GET /categories). */
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

/** PATCH /community/groups/:id */
export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsEnum(GroupVisibility)
  visibility?: GroupVisibility;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}

export class GroupSearchQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  womenOnly?: "true" | "false";

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  q?: string;
}

export class GroupMembersQueryDto extends CursorQueryDto {
  /** Moderators can list PENDING (requests and invitations). */
  @IsOptional()
  @IsIn([GroupMemberStatus.ACTIVE, GroupMemberStatus.PENDING])
  status?: "ACTIVE" | "PENDING";
}

export class InviteGroupMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  userIds!: string[];
}

export class GroupMemberRoleDto {
  @IsEnum(GroupMemberRole)
  role!: GroupMemberRole;
}

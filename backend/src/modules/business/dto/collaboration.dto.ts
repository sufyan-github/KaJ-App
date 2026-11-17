import { CollaborationStatus, CollaborationSubjectType } from "@prisma/client";
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

import { CursorQueryDto } from "../../../common/api/cursor-query.dto";

/** POST /collaboration-requests */
export class CreateCollaborationRequestDto {
  @IsEnum(CollaborationSubjectType)
  subjectType!: CollaborationSubjectType;

  /** The business or idea id. */
  @IsUUID()
  subjectId!: string;

  /** P2.8: the idea role this is about ("I'm interested in this role"). */
  @IsOptional()
  @IsUUID()
  ideaRoleId?: string;

  /** One of your own businesses, as context (optional). */
  @IsOptional()
  @IsUUID()
  fromBusinessId?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  message!: string;
}

/** GET /collaboration-requests */
export class CollaborationListQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(["sent", "received", "all"])
  box?: "sent" | "received" | "all";

  @IsOptional()
  @IsEnum(CollaborationStatus)
  status?: CollaborationStatus;

  @IsOptional()
  @IsEnum(CollaborationSubjectType)
  subjectType?: CollaborationSubjectType;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

/** Body of accept / decline / withdraw / agree / end (all optional). */
export class CollaborationActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** agree: what the two agreed in principle (not a contract). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;
}

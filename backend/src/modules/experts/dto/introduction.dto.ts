import { IntroductionContextType, IntroductionStatus } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

import { CursorQueryDto } from "../../../common/api/cursor-query.dto";

/** POST /introductions */
export class CreateIntroductionDto {
  /** The expert: an approved mentor who is taking requests. */
  @IsUUID()
  expertUserId!: string;

  @IsEnum(IntroductionContextType)
  contextType!: IntroductionContextType;

  /** Your idea or business (not for a learning goal). */
  @ValidateIf(
    (input: CreateIntroductionDto) =>
      input.contextType !== IntroductionContextType.LEARNING_GOAL,
  )
  @IsUUID()
  contextId?: string;

  /** LEARNING_GOAL only: what you want to learn, in a line or two. */
  @ValidateIf(
    (input: CreateIntroductionDto) =>
      input.contextType === IntroductionContextType.LEARNING_GOAL,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  learningGoal?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  message!: string;

  /** IDEA only, owner only: let the expert see the idea's details on accept. */
  @IsOptional()
  @IsBoolean()
  allowIdeaAccess?: boolean;
}

export class IntroductionListQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(["sent", "received", "all"])
  box?: "sent" | "received" | "all";

  @IsOptional()
  @IsEnum(IntroductionStatus)
  status?: IntroductionStatus;
}

/** POST /introductions/:id/accept */
export class AcceptIntroductionDto {
  /** Needed to receive idea access when the requester offered it. */
  @IsOptional()
  @IsBoolean()
  acceptConfidentiality?: boolean;
}

/** POST /introductions/:id/decline */
export class DeclineIntroductionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

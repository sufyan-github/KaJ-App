import {
  OpportunityType,
  ParticipantTerms,
  WorkArrangement,
} from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { CursorQueryDto } from "../../../common/api/cursor-query.dto";

const MONEY = /^\d{1,15}$/;
const LEARNING_TYPES = [
  OpportunityType.TRAINING,
  OpportunityType.APPRENTICESHIP,
] as const;

/** A training or apprenticeship, published by an approved mentor. */
export class CreateLearningOpportunityDto {
  @IsIn(LEARNING_TYPES)
  opportunityType!: (typeof LEARNING_TYPES)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  description!: string;

  @IsUUID()
  categoryId!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  skillIds!: string[];

  @IsUUID()
  locationId!: string;

  @IsEnum(ParticipantTerms)
  participantTerms!: ParticipantTerms;

  /** Required for PAID_BY_PARTICIPANT: what the learner pays, in poisha. */
  @IsOptional()
  @Matches(MONEY)
  participantFeePoisha?: string;

  /** Required for STIPEND: what the learner receives, in poisha. */
  @IsOptional()
  @Matches(MONEY)
  stipendPoisha?: string;

  /** How many learners the mentor takes. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  seats!: number;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsEnum(WorkArrangement)
  workArrangement?: WorkArrangement;

  @IsOptional()
  @IsBoolean()
  flexibleHours?: boolean;

  /** A published KAAJ course that goes with it (blended learning). */
  @IsOptional()
  @IsUUID()
  trainingCourseId?: string;
}

export class LearningFeedQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(LEARNING_TYPES)
  opportunityType?: (typeof LEARNING_TYPES)[number];

  @IsOptional()
  @IsEnum(ParticipantTerms)
  participantTerms?: ParticipantTerms;

  @IsOptional()
  @IsEnum(WorkArrangement)
  workArrangement?: WorkArrangement;

  @IsOptional()
  @IsUUID()
  skillId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class ApplyToLearningDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class RecordLearningSessionDto {
  @IsDateString()
  heldAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;

  /** What was taught, e.g. "Replacing a charging port". */
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  topic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

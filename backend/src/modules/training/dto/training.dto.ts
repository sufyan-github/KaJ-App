import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class CourseListQueryDto {
  @IsOptional()
  @IsIn(["mine", "all"])
  scope?: "mine" | "all";
}

export class TrainingAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsString()
  @MaxLength(16)
  @Matches(/^[A-Za-z0-9_-]+$/)
  optionId!: string;
}

export class SubmitTrainingAttemptDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TrainingAnswerDto)
  answers!: TrainingAnswerDto[];
}

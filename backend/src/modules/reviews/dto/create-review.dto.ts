import { ReviewSubjectType } from "@prisma/client";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  punctuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  quality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  communication?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  reliability?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** A review of any subject: POST /reviews. */
export class CreateSubjectReviewDto extends CreateReviewDto {
  @IsEnum(ReviewSubjectType)
  subjectType!: ReviewSubjectType;

  @IsUUID()
  subjectId!: string;
}

/** GET /reviews/subject?subjectType=…&subjectId=… */
export class ReviewSubjectQueryDto {
  @IsEnum(ReviewSubjectType)
  subjectType!: ReviewSubjectType;

  @IsUUID()
  subjectId!: string;
}

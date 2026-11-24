import {
  IsIn,
  IsInt,
  IsObject,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import {
  STEP_IMAGE_MAX_BYTES,
  STEP_IMAGE_MIME_TYPES,
  type StepImageMime,
} from "../training-step-images.service";

/**
 * The course document is validated with the content loader's schema (one
 * source of truth), so it is accepted here as an object.
 */
export class CourseDocumentDto {
  @IsObject()
  document!: Record<string, unknown>;

  /** The typed operational reason, kept in the audit row. */
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class PublishReasonDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

/** Upload purpose TRAINING_STEP_IMAGE. */
export class StepImageSignDto {
  @IsIn(STEP_IMAGE_MIME_TYPES)
  mime!: StepImageMime;

  @IsInt()
  @Min(1)
  @Max(STEP_IMAGE_MAX_BYTES)
  sizeBytes!: number;
}

export class StepImageCompleteDto extends StepImageSignDto {
  @IsString()
  @MaxLength(300)
  key!: string;
}

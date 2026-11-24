import { IsObject, IsString, MaxLength, MinLength } from "class-validator";

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

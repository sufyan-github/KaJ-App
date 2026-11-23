import { Gender, VerificationKind } from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateIf,
} from "class-validator";

export class SubmitVerificationDto {
  @IsEnum(VerificationKind)
  kind!: VerificationKind;

  @ValidateIf(
    (input: SubmitVerificationDto) => input.kind !== VerificationKind.IDENTITY,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsUUID("all", { each: true })
  documentIds?: string[];

  @ValidateIf(
    (input: SubmitVerificationDto) => input.kind === VerificationKind.IDENTITY,
  )
  @IsUUID()
  nidDocumentId?: string;

  @ValidateIf(
    (input: SubmitVerificationDto) => input.kind === VerificationKind.IDENTITY,
  )
  @IsUUID()
  selfieDocumentId?: string;

  /**
   * R7 B1: IDENTITY only. Required when the profile has no gender; the
   * approval copies it to the profile, where it then locks.
   */
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}

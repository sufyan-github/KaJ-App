import { VerificationKind } from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
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
}

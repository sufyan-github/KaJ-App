import { VerificationKind } from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsUUID,
} from "class-validator";

export class SubmitVerificationDto {
  @IsEnum(VerificationKind)
  kind!: VerificationKind;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsUUID("all", { each: true })
  documentIds!: string[];
}

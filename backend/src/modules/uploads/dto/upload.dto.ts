import { IsIn, IsInt, IsString, MaxLength, Min } from "class-validator";

import { UPLOAD_KINDS, UploadKind } from "../upload.policy";

export class SignUploadDto {
  @IsIn(UPLOAD_KINDS)
  kind!: UploadKind;

  @IsString()
  @IsIn(["image/jpeg", "image/png", "image/webp", "application/pdf"])
  mime!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

export class CompleteUploadDto extends SignUploadDto {
  @IsString()
  @MaxLength(1_024)
  key!: string;
}

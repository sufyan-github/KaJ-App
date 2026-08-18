import { IsString, IsUUID, Matches } from "class-validator";

export class VerifyOtpDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @IsUUID()
  deviceId!: string;
}

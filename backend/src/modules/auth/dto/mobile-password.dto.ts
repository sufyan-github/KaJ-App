import {
  Equals,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { RequestOtpDto } from "./request-otp.dto";

export class PasswordLoginDto extends RequestOtpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;

  @IsUUID()
  deviceId!: string;
}

export class SetMobilePasswordDto {
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;
}

export class RequestPasswordRecoveryDto extends RequestOtpDto {
  @Equals(true)
  subscriptionConsent!: true;
}

export class ResetMobilePasswordDto extends SetMobilePasswordDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @Equals(true)
  subscriptionConsent!: true;
}

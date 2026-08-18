import { DevicePlatform } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class RegisterDeviceDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  fcmToken?: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string;
}

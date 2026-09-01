import { NotificationChannel } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class NotificationPreferenceDto {
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsString()
  @MaxLength(80)
  type!: string;

  @IsBoolean()
  isEnabled!: boolean;

  @IsOptional()
  @Matches(TIME_PATTERN)
  quietHoursStart?: string;

  @IsOptional()
  @Matches(TIME_PATTERN)
  quietHoursEnd?: string;
}

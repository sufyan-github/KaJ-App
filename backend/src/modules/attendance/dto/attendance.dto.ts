import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { RoundTo } from "../../../common/validation/round-to.decorator";

export class CheckInDto {
  @RoundTo(7)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @RoundTo(7)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @RoundTo(2)
  @IsNumber()
  @Min(0)
  @Max(10_000)
  accuracyM!: number;

  @IsBoolean()
  consentGranted!: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  consentVersion!: string;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;

  @IsOptional()
  @IsUUID()
  photoDocumentId?: string;

  @IsOptional()
  @IsBoolean()
  mockLocation?: boolean;
}

export class CheckOutDto {
  @RoundTo(7)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @RoundTo(7)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @RoundTo(2)
  @IsNumber()
  @Min(0)
  @Max(10_000)
  accuracyM!: number;

  @IsBoolean()
  consentGranted!: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  consentVersion!: string;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Sent by app versions up to 1.0.2; recorded for review like check-in.
  @IsOptional()
  @IsBoolean()
  mockLocation?: boolean;
}

export class AttendanceOverrideDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

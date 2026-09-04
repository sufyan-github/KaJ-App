import { Type } from "class-transformer";
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

export class CheckInDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  lng!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
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
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  lng!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
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
}

export class AttendanceOverrideDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

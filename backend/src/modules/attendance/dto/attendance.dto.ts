import { Transform } from "class-transformer";
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

/**
 * Rounds to the precision the database stores instead of rejecting longer
 * values. Android reports coordinates with many decimals and widens the
 * Float accuracy to a Double (3.9 → 3.9000000953674316), which the previous
 * `maxDecimalPlaces` rules rejected with 400.
 */
function RoundTo(places: number) {
  const factor = 10 ** places;
  return Transform(({ value }: { value: unknown }) => {
    const number =
      typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    if (typeof number !== "number" || !Number.isFinite(number)) return value;
    return Math.round(number * factor) / factor;
  });
}

const FINITE = { allowNaN: false, allowInfinity: false } as const;

/** Fields shared by check-in and check-out (stored as decimal(9,6) / (8,2)). */
export class AttendanceLocationDto {
  @RoundTo(6)
  @IsNumber(FINITE)
  @Min(-90)
  @Max(90)
  lat!: number;

  @RoundTo(6)
  @IsNumber(FINITE)
  @Min(-180)
  @Max(180)
  lng!: number;

  @RoundTo(2)
  @IsNumber(FINITE)
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
  @IsBoolean()
  mockLocation?: boolean;
}

export class CheckInDto extends AttendanceLocationDto {
  @IsOptional()
  @IsUUID()
  photoDocumentId?: string;
}

export class CheckOutDto extends AttendanceLocationDto {
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

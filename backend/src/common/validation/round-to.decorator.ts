import { Transform } from "class-transformer";

/**
 * Rounds a numeric input to a fixed number of decimal places before
 * validation. Phone GPS readings carry ~15 decimal places and Android reports
 * accuracy as a float (12.3 arrives as 12.300000190734863), so a real reading
 * must be rounded rather than rejected. Non-numeric input is left as-is (or
 * NaN) so @IsNumber still rejects it.
 */
export function RoundTo(places: number) {
  return Transform(({ value }: { value: unknown }) => {
    const number = typeof value === "string" ? Number(value) : value;
    if (typeof number !== "number" || !Number.isFinite(number)) return number;
    const factor = 10 ** places;
    return Math.round(number * factor) / factor;
  });
}

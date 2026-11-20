import { ValidateIf, ValidationOptions } from "class-validator";

/**
 * W16: like @IsOptional(), but only for a missing field. An explicit null
 * is checked by the field's other validators (and so refused), instead of
 * slipping through to the database as a 500. Use it for optional fields
 * that cannot be null; keep @IsOptional() for ones that can be cleared.
 */
export function IsOptionalNotNull(options?: ValidationOptions) {
  return ValidateIf((_object, value) => value !== undefined, options);
}

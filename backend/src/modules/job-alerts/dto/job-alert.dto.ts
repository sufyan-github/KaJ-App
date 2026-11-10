import { IsUUID, ValidateIf } from "class-validator";

function noFilterSet(value: CreateJobAlertDto): boolean {
  return !value.categoryId && !value.skillId && !value.locationId;
}

export class CreateJobAlertDto {
  // Validated when present, and also when every filter is missing, so an
  // empty alert fails validation on categoryId.
  @ValidateIf(
    (value: CreateJobAlertDto) =>
      value.categoryId !== undefined || noFilterSet(value),
  )
  @IsUUID()
  categoryId?: string;

  @ValidateIf((value: CreateJobAlertDto) => value.skillId !== undefined)
  @IsUUID()
  skillId?: string;

  @ValidateIf((value: CreateJobAlertDto) => value.locationId !== undefined)
  @IsUUID()
  locationId?: string;
}

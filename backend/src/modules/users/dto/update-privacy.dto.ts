import { MessagePermission, PhotoVisibility } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional } from "class-validator";

/** Every field is optional: only the ones sent are changed. */
export class UpdatePrivacyDto {
  @IsOptional()
  @IsEnum(PhotoVisibility)
  photoVisibility?: PhotoVisibility;

  /** false = shown as "Rahima K." to people outside a hire. */
  @IsOptional()
  @IsBoolean()
  showFullName?: boolean;

  /** true = no map point, only the area name. */
  @IsOptional()
  @IsBoolean()
  hidePreciseArea?: boolean;

  @IsOptional()
  @IsEnum(MessagePermission)
  allowMessagesFrom?: MessagePermission;

  /** false = left out of the worker directory and suggestions. */
  @IsOptional()
  @IsBoolean()
  discoverable?: boolean;
}

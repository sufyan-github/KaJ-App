import { Transform } from "class-transformer";
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { AdminRole } from "@prisma/client";

import { ReasonDto } from "../../admin-ops/dto/admin-ops.dto";

export class StaffInviteDto extends ReasonDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName!: string;

  @IsEnum(AdminRole)
  role!: AdminRole;
}

export class StaffRoleDto extends ReasonDto {
  @IsEnum(AdminRole)
  role!: AdminRole;
}

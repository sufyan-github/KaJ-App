import { RoleMode } from "@prisma/client";
import { IsEnum } from "class-validator";

export class ActivateRoleDto {
  @IsEnum(RoleMode)
  role!: RoleMode;
}

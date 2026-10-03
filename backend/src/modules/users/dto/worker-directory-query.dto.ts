import { IsOptional, IsUUID } from "class-validator";

export class WorkerDirectoryQueryDto {
  @IsOptional()
  @IsUUID()
  skillId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

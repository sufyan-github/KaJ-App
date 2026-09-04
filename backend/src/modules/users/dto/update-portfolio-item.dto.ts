import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class UpdatePortfolioItemDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  caption?: string;
}

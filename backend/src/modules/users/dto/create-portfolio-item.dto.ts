import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreatePortfolioItemDto {
  @IsUUID()
  documentId!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  caption?: string;
}

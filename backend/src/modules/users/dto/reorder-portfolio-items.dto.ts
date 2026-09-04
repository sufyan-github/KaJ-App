import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from "class-validator";

export class ReorderPortfolioItemsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  itemIds!: string[];
}

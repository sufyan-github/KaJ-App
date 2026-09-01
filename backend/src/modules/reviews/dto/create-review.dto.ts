import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  punctuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  quality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  communication?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  reliability?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

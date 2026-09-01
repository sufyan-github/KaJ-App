import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, MinLength } from "class-validator";

export class AdminLoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;
}

export class AdminTotpDto {
  @IsString()
  @MinLength(32)
  challengeToken!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

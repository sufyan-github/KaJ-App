import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { SubscriptionPaymentStatus, SubscriptionStatus } from "@prisma/client";

const CODE = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/u;
const FEATURE = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/u;

export class RequestSubscriptionDto {
  @IsUUID()
  planId!: string;

  @IsString()
  @Matches(CODE)
  operatorCode!: string;
}

export class SubscriptionQueryDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class CreateSubscriptionPlanDto {
  @IsString()
  @Matches(CODE)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nameBn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionBn?: string;

  @IsString()
  @Matches(/^\d{1,12}$/u)
  pricePoisha!: string;

  @IsInt()
  @Min(1)
  @Max(366)
  durationDays!: number;

  @IsArray()
  @ArrayMaxSize(30)
  @Matches(FEATURE, { each: true })
  featureKeys!: string[];

  @IsBoolean()
  isActive = false;

  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder = 0;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class UpdateSubscriptionPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nameBn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionBn?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,12}$/u)
  pricePoisha?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(366)
  durationDays?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(FEATURE, { each: true })
  featureKeys?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class UpdateSubscriptionDto {
  @IsEnum(SubscriptionStatus)
  status!: SubscriptionStatus;

  @IsOptional()
  @IsEnum(SubscriptionPaymentStatus)
  paymentStatus?: SubscriptionPaymentStatus;

  @IsOptional()
  @IsBoolean()
  operatorVerified?: boolean;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class UpdateAccessRuleDto {
  @IsBoolean()
  requiresActiveSubscription!: boolean;

  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

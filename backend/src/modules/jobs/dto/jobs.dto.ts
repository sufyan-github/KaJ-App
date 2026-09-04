import { Type } from "class-transformer";
import { JobType, PaymentModel } from "@prisma/client";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  IsBoolean,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const MONEY_PATTERN = /^\d{1,15}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class JobScheduleDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @Matches(TIME_PATTERN)
  startTime!: string;

  @Matches(TIME_PATTERN)
  endTime!: string;
}

export class RecurrenceRuleDto {
  @IsIn(["DAILY", "WEEKLY"])
  frequency!: "DAILY" | "WEEKLY";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @Matches(TIME_PATTERN)
  startTime!: string;

  @Matches(TIME_PATTERN)
  endTime!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  until?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  count?: number;

  @IsIn(["Asia/Dhaka"])
  timezone!: "Asia/Dhaka";
}

export class CreateJobDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  description!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID("4", { each: true })
  skillIds!: string[];

  @IsEnum(JobType)
  jobType!: JobType;

  @IsEnum(PaymentModel)
  paymentModel!: PaymentModel;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  budgetMinPoisha?: string;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  budgetMaxPoisha?: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  areaLabel?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  workersRequired?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(62)
  @ValidateNested({ each: true })
  @Type(() => JobScheduleDto)
  schedules?: JobScheduleDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  recurrenceRule?: RecurrenceRuleDto;
}

export class UpdateJobSeriesDto {
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  recurrenceRule!: RecurrenceRuleDto;
}

export class CancelOccurrenceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}

export class JobFeedQueryDto {
  @IsOptional()
  @IsIn(["all", "for-me"])
  scope?: "all" | "for-me";

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class ApplyToJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  proposedPricePoisha?: string;

  @IsDateString()
  proposedStartsAt!: string;

  @IsDateString()
  proposedEndsAt!: string;
}

export class AcceptApplicationDto {
  @IsOptional()
  @Matches(MONEY_PATTERN)
  agreedPricePoisha?: string;
}

export class CreateBookingRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  description!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  skillId?: string;

  @IsUUID()
  locationId!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @Matches(MONEY_PATTERN)
  offeredPricePoisha!: string;
}

export class CancelAssignmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  reasonCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

import { IsOptionalNotNull } from "../../../common/validation/optional-not-null";
import {
  SessionMode,
  SessionParticipantStatus,
  SessionPriceModel,
  SessionStatus,
  SessionSubjectType,
} from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { CursorQueryDto } from "../../../common/api/cursor-query.dto";

const MONEY = /^\d{1,15}$/;
const HOSTED_KINDS = ["GROUP_DISCUSSION", "WORKSHOP", "EVENT"] as const;

class SessionPlaceDto {
  @IsEnum(SessionMode)
  mode!: SessionMode;

  /** IN_PERSON: the area (a location id) — never an address. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** ONLINE: shown only to accepted participants. */
  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(500)
  onlineLink?: string;
}

/** POST /sessions — a group discussion, workshop or event you host. */
export class CreateSessionDto extends SessionPlaceDto {
  @IsIn(HOSTED_KINDS)
  kind!: (typeof HOSTED_KINDS)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  startsAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(720)
  durationMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;

  @IsOptional()
  @IsEnum(SessionPriceModel)
  priceModel?: SessionPriceModel;

  @IsOptional()
  @Matches(MONEY)
  pricePoisha?: string;

  @IsOptional()
  @IsBoolean()
  womenOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  homeBasedFriendly?: boolean;

  @IsOptional()
  @IsEnum(SessionSubjectType)
  subjectType?: SessionSubjectType;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

/** PATCH /sessions/:id — any subset (host; not once cancelled or completed). */
export class UpdateSessionDto {
  @IsOptionalNotNull()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptionalNotNull()
  @IsDateString()
  startsAt?: string;

  @IsOptionalNotNull()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(720)
  durationMinutes?: number;

  @IsOptionalNotNull()
  @IsEnum(SessionMode)
  mode?: SessionMode;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(500)
  onlineLink?: string | null;

  @IsOptionalNotNull()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;

  @IsOptionalNotNull()
  @IsEnum(SessionPriceModel)
  priceModel?: SessionPriceModel;

  @IsOptional()
  @Matches(MONEY)
  pricePoisha?: string | null;

  @IsOptionalNotNull()
  @IsBoolean()
  womenOnly?: boolean;

  @IsOptionalNotNull()
  @IsBoolean()
  homeBasedFriendly?: boolean;
}

/** POST /sessions/consultations — book a one-to-one with an expert. */
export class BookConsultationDto extends SessionPlaceDto {
  @IsUUID()
  expertUserId!: string;

  @IsDateString()
  startsAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(180)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** The accepted introduction this follows, if any. */
  @IsOptional()
  @IsUUID()
  introductionId?: string;
}

/** POST /sessions/:id/respond — answer an invitation. */
export class RespondSessionDto {
  @IsBoolean()
  accept!: boolean;

  /** Consultation expert, ONLINE: the meeting link. */
  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(500)
  onlineLink?: string;

  /** Consultation expert: charge cash (default free). */
  @IsOptional()
  @IsEnum(SessionPriceModel)
  priceModel?: SessionPriceModel;

  @IsOptional()
  @Matches(MONEY)
  pricePoisha?: string;
}

export class InviteSessionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  userIds!: string[];
}

export class CancelSessionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class SessionAttendanceDto {
  @IsUUID()
  userId!: string;

  @IsIn([SessionParticipantStatus.ATTENDED, SessionParticipantStatus.NO_SHOW])
  status!: "ATTENDED" | "NO_SHOW";
}

export class SessionCashDto {
  @IsUUID()
  userId!: string;

  @Matches(MONEY)
  amountPoisha!: string;
}

export class SessionListQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(["hosting", "attending", "all"])
  role?: "hosting" | "attending" | "all";

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;
}

export class ExpertSlotsQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

/** POST /community/groups/:id/sessions — moderators and ambassadors. */
export class CreateGroupSessionDto extends CreateSessionDto {
  /** In person: the venue pin, used only for check-in (never shown). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  venueLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  venueLng?: number;
}

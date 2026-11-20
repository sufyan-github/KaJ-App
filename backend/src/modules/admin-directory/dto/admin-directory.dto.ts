import { IsEnum, IsIn, IsOptional } from "class-validator";
import { IntroductionStatus, MentorStatus } from "@prisma/client";

import { PageQueryDto } from "../../admin-ops/dto/admin-ops.dto";

export class ContentListQueryDto extends PageQueryDto {
  /** hidden = suspended/hidden by moderation; visible = not. */
  @IsOptional()
  @IsIn(["all", "visible", "hidden"])
  state: "all" | "visible" | "hidden" = "all";
}

export class IntroductionListQueryDto extends ContentListQueryDto {
  @IsOptional()
  @IsEnum(IntroductionStatus)
  status?: IntroductionStatus;
}

export class MentorListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(MentorStatus)
  status?: MentorStatus;
}

export class AttendanceListQueryDto extends PageQueryDto {
  /**
   * needs-checkin: start time passed, nobody checked in.
   * needs-checkout: checked in, end time passed, not checked out.
   */
  @IsOptional()
  @IsIn(["all", "needs-checkin", "needs-checkout"])
  state: "all" | "needs-checkin" | "needs-checkout" = "all";
}

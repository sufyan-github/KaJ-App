import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { RoleMode } from "@prisma/client";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import {
  RecordLearningSessionDto,
  WithdrawLearningDto,
} from "./dto/learning.dto";
import { LearningEnrolmentsService } from "./learning-enrolments.service";

/** P1.3: accepting learners, enrolments (terms) and session progress. */
@ApiTags("learning")
@Controller()
export class LearningEnrolmentsController {
  constructor(private readonly enrolments: LearningEnrolmentsService) {}

  @Get("learning-opportunities/:id/applications")
  @Roles(RoleMode.MENTOR)
  @Policy(Policies.mentorOwner())
  applications(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.enrolments.applications(claims.sub, id);
  }

  @Post("learning-applications/:id/accept")
  @Roles(RoleMode.MENTOR)
  @Policy(Policies.jobPoster({ source: "application" }))
  accept(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.enrolments.accept(claims.sub, id);
  }

  @Post("learning-applications/:id/decline")
  @Roles(RoleMode.MENTOR)
  @Policy(Policies.jobPoster({ source: "application" }))
  decline(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.enrolments.decline(claims.sub, id);
  }

  /** The learner withdraws (before or after acceptance). */
  @Post("learning-applications/:id/withdraw")
  @Policy(Policies.authenticated())
  withdrawApplication(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: WithdrawLearningDto,
  ) {
    return this.enrolments.withdrawApplication(claims.sub, id, body);
  }

  @Post("learning-enrolments/:id/withdraw")
  @Policy(Policies.assignedWorker())
  withdrawEnrolment(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: WithdrawLearningDto,
  ) {
    return this.enrolments.withdrawEnrolment(claims.sub, id, body);
  }

  @Get("learning-enrolments")
  @Policy(Policies.authenticated())
  mine(@CurrentUser() claims: AccessTokenClaims) {
    return this.enrolments.enrolments(claims.sub);
  }

  @Get("learning-enrolments/:id")
  @Policy(
    Policies.jobPoster({ source: "assignment" }),
    Policies.assignedWorker(),
  )
  get(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.enrolments.enrolment(claims.sub, id);
  }

  @Post("learning-enrolments/:id/sessions")
  @Roles(RoleMode.MENTOR)
  @Policy(Policies.jobPoster({ source: "assignment" }))
  recordSession(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: RecordLearningSessionDto,
  ) {
    return this.enrolments.recordSession(claims.sub, id, body);
  }

  @Post("learning-enrolments/:id/complete")
  @Roles(RoleMode.MENTOR)
  @Policy(Policies.jobPoster({ source: "assignment" }))
  complete(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.enrolments.complete(claims.sub, id);
  }

  @Post("learning-sessions/:id/confirm")
  @Policy(Policies.authenticated())
  confirmSession(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.enrolments.confirmSession(claims.sub, id);
  }
}

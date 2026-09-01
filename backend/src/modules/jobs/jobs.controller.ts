import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { RoleMode } from "@prisma/client";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import {
  AcceptApplicationDto,
  ApplyToJobDto,
  CancelAssignmentDto,
  CreateBookingRequestDto,
  CreateJobDto,
  JobFeedQueryDto,
} from "./dto/jobs.dto";
import { JobsService } from "./jobs.service";

@ApiTags("jobs")
@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post("jobs")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  create(@CurrentUser() claims: AccessTokenClaims, @Body() body: CreateJobDto) {
    return this.jobs.create(claims.sub, body);
  }

  @Post("jobs/:id/publish")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  publish(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.publish(claims.sub, id);
  }

  @Get("jobs")
  @Policy(Policies.authenticated())
  feed(
    @CurrentUser() claims: AccessTokenClaims,
    @Query() query: JobFeedQueryDto,
  ) {
    return this.jobs.feed(claims.sub, query);
  }

  @Get("jobs/mine")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  mine(@CurrentUser() claims: AccessTokenClaims) {
    return this.jobs.mine(claims.sub);
  }

  @Get("jobs/:id")
  @Policy(Policies.authenticated())
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.jobs.get(id);
  }

  @Get("jobs/:id/suggested-workers")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  suggestedWorkers(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.suggestedWorkers(claims.sub, id);
  }

  @Post("jobs/:id/applications")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  apply(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ApplyToJobDto,
  ) {
    return this.jobs.apply(claims.sub, id, body);
  }

  @Get("jobs/:id/applications")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  applications(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.listApplications(claims.sub, id);
  }

  @Get("assignments")
  @Policy(Policies.authenticated())
  assignments(@CurrentUser() claims: AccessTokenClaims) {
    return this.jobs.listAssignments(claims.sub);
  }

  @Post("applications/:id/accept")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  accept(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: AcceptApplicationDto,
  ) {
    return this.jobs.acceptApplication(claims.sub, id, body);
  }

  @Post("workers/:workerId/booking-requests")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  book(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("workerId", new ParseUUIDPipe()) workerId: string,
    @Body() body: CreateBookingRequestDto,
  ) {
    return this.jobs.createBookingRequest(claims.sub, workerId, body);
  }

  @Post("assignments/:id/confirm")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  confirm(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.confirmAssignment(claims.sub, id);
  }

  @Post("assignments/:id/decline")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  decline(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.declineAssignment(claims.sub, id);
  }

  @Get("assignments/:id")
  @Policy(Policies.authenticated())
  assignment(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.getAssignment(claims.sub, id);
  }

  @Post("assignments/:id/submit")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  submit(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.submitWork(claims.sub, id);
  }

  @Post("assignments/:id/complete")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  complete(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.completeWork(claims.sub, id);
  }

  @Post("assignments/:id/cancel-preview")
  @Policy(Policies.authenticated())
  cancelPreview(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: CancelAssignmentDto,
  ) {
    return this.jobs.cancelPreview(claims.sub, id, body);
  }

  @Post("assignments/:id/cancel")
  @Policy(Policies.authenticated())
  cancel(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: CancelAssignmentDto,
  ) {
    return this.jobs.cancelAssignment(claims.sub, id, body);
  }
}

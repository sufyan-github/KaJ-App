import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  CancelOccurrenceDto,
  CreateBookingRequestDto,
  CreateJobDto,
  JobFeedQueryDto,
  UpdateJobSeriesDto,
} from "./dto/jobs.dto";
import { JobsService } from "./jobs.service";
import { RecurrenceService } from "./recurrence/recurrence.service";
import {
  SubscriptionFeature,
  SubscriptionFeatures,
} from "../subscriptions/subscription-feature";

@ApiTags("jobs")
@Controller()
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly recurrence: RecurrenceService,
  ) {}

  @Post("jobs")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  @SubscriptionFeature(SubscriptionFeatures.jobPosting)
  create(@CurrentUser() claims: AccessTokenClaims, @Body() body: CreateJobDto) {
    return this.jobs.create(claims.sub, body);
  }

  @Post("jobs/:id/publish")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  @SubscriptionFeature(SubscriptionFeatures.jobPosting)
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

  @Get("jobs/:id/occurrences")
  @Policy(Policies.authenticated())
  occurrences(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.recurrence.list(id);
  }

  @Get("occurrences/mine")
  @Policy(Policies.authenticated())
  myOccurrences(@CurrentUser() claims: AccessTokenClaims) {
    return this.recurrence.mine(claims.sub);
  }

  @Put("jobs/:id/series")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  updateSeries(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateJobSeriesDto,
  ) {
    return this.recurrence.updateSeries(claims.sub, id, body);
  }

  @Post("occurrences/:id/cancel")
  @Policy(Policies.authenticated())
  cancelOccurrence(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: CancelOccurrenceDto,
  ) {
    return this.recurrence.cancel(claims.sub, id, body);
  }

  @Post("occurrences/:id/assignments/:assignmentId")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  assignOccurrence(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
  ) {
    return this.recurrence.assign(claims.sub, id, assignmentId);
  }

  @Get("jobs/:id/suggested-workers")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  @SubscriptionFeature(SubscriptionFeatures.workerDiscovery)
  suggestedWorkers(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.suggestedWorkers(claims.sub, id);
  }

  @Post("jobs/:id/applications")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  @SubscriptionFeature(SubscriptionFeatures.jobApplication)
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
  @SubscriptionFeature(SubscriptionFeatures.workerHiring)
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
  @SubscriptionFeature(SubscriptionFeatures.workerHiring)
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

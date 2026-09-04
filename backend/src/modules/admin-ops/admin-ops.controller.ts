import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminRole } from "@prisma/client";
import { Request } from "express";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AdminRoles, CurrentAdmin } from "../admin-auth/admin-auth.decorators";
import { AdminSessionGuard } from "../admin-auth/admin-session.guard";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import { AdminOpsService } from "./admin-ops.service";
import {
  ApplicationActionDto,
  CampaignDto,
  CategoryDto,
  ConfigChangeDto,
  DisputeResolutionDto,
  FeatureJobDto,
  FlagChangeDto,
  ForceTransitionDto,
  JobQueryDto,
  LocationDto,
  PageQueryDto,
  ReasonDto,
  UserActionDto,
  UserQueryDto,
  VerificationDecisionDto,
  VerificationQueryDto,
} from "./dto/admin-ops.dto";

const OPS_ROLES = [
  AdminRole.ADMIN,
  AdminRole.MODERATOR,
  AdminRole.SUPPORT,
  AdminRole.FINANCE,
];

@Controller("admin")
@UseGuards(AdminSessionGuard)
export class AdminOpsController {
  constructor(private readonly ops: AdminOpsService) {}

  @Get("dashboard")
  @Policy(Policies.public())
  @AdminRoles(...OPS_ROLES)
  dashboard(@CurrentAdmin() actor: AdminActor, @Req() request: Request) {
    return this.ops.overview(actor, this.context(request));
  }

  @Get("users")
  @Policy(Policies.public())
  @AdminRoles(...OPS_ROLES)
  users(
    @Query() query: UserQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.users(query, actor, this.context(request));
  }

  @Post("users/:id/status")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  userStatus(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UserActionDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.userAction(id, body, actor, this.context(request));
  }

  @Post("users/:id/reset-sessions")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPPORT)
  resetSessions(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.resetUserSessions(
      id,
      body.reason,
      actor,
      this.context(request),
    );
  }

  @Get("users/:id/impersonate-read-only")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPPORT)
  impersonate(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.impersonateReadOnly(id, actor, this.context(request));
  }

  @Get("jobs")
  @Policy(Policies.public())
  @AdminRoles(...OPS_ROLES)
  jobs(
    @Query() query: JobQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.jobs(query, actor, this.context(request));
  }

  @Post("jobs/:id/force-transition")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  transition(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ForceTransitionDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.forceTransition(id, body, actor, this.context(request));
  }

  @Post("jobs/:id/feature")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  feature(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: FeatureJobDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.featureJob(id, body, actor, this.context(request));
  }

  @Get("applications")
  @Policy(Policies.public())
  @AdminRoles(...OPS_ROLES)
  applications(
    @Query() query: PageQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.applications(query, actor, this.context(request));
  }

  @Post("applications/:id/unstick")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  unstick(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ApplicationActionDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.unstickApplication(id, body, actor, this.context(request));
  }

  @Get("verification-requests")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  verificationQueue(
    @Query() query: VerificationQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.verifications(query, actor, this.context(request));
  }

  @Get("verification-documents/:id")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  verificationDocument(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.verificationDocument(id, actor, this.context(request));
  }

  @Post("verification-requests/:id/decision")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  verificationDecision(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: VerificationDecisionDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.decideVerification(id, body, actor, this.context(request));
  }

  @Get("categories")
  @Policy(Policies.public())
  @AdminRoles(...OPS_ROLES)
  categories(@CurrentAdmin() actor: AdminActor, @Req() request: Request) {
    return this.ops.categories(actor, this.context(request));
  }

  @Post("categories")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  createCategory(
    @Body() body: CategoryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.saveCategory(null, body, actor, this.context(request));
  }

  @Put("categories/:id")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  updateCategory(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: CategoryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.saveCategory(id, body, actor, this.context(request));
  }

  @Get("locations")
  @Policy(Policies.public())
  @AdminRoles(...OPS_ROLES)
  locations(@CurrentAdmin() actor: AdminActor, @Req() request: Request) {
    return this.ops.locations(actor, this.context(request));
  }

  @Post("locations")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  createLocation(
    @Body() body: LocationDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.saveLocation(null, body, actor, this.context(request));
  }

  @Put("locations/:id")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  updateLocation(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: LocationDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.saveLocation(id, body, actor, this.context(request));
  }

  @Get("config")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.FINANCE)
  config(@CurrentAdmin() actor: AdminActor, @Req() request: Request) {
    return this.ops.config(actor, this.context(request));
  }

  @Post("config/:key/preview")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.FINANCE)
  previewConfig(
    @Param("key") key: string,
    @Body() body: ConfigChangeDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.previewConfig(key, body, actor, this.context(request));
  }

  @Put("config/:key")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.FINANCE)
  updateConfig(
    @Param("key") key: string,
    @Body() body: ConfigChangeDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.updateConfig(key, body, actor, this.context(request));
  }

  @Post("config/revisions/:id/revert")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  revertConfig(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.revertConfig(id, body.reason, actor, this.context(request));
  }

  @Get("flags")
  @Policy(Policies.public())
  @AdminRoles(...OPS_ROLES)
  flags(@CurrentAdmin() actor: AdminActor, @Req() request: Request) {
    return this.ops.flags(actor, this.context(request));
  }

  @Put("flags/:key")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  updateFlag(
    @Param("key") key: string,
    @Body() body: FlagChangeDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.updateFlag(key, body, actor, this.context(request));
  }

  @Get("disputes")
  @Policy(Policies.public())
  @AdminRoles(
    AdminRole.ADMIN,
    AdminRole.MODERATOR,
    AdminRole.SUPPORT,
    AdminRole.FINANCE,
  )
  disputes(
    @Query() query: PageQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.disputes(query, actor, this.context(request));
  }

  @Post("disputes/:id/resolve")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.FINANCE)
  resolveDispute(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: DisputeResolutionDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.resolveDispute(id, body, actor, this.context(request));
  }

  @Post("disputes/:id/review")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  reviewDispute(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.startDisputeReview(id, actor, this.context(request));
  }

  @Post("notifications/campaign/dry-run")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPPORT)
  campaignDryRun(
    @Body() body: CampaignDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.campaignDryRun(body, actor, this.context(request));
  }

  @Post("notifications/campaign/send")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  sendCampaign(
    @Body() body: CampaignDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.sendCampaign(body, actor, this.context(request));
  }

  @Get("analytics")
  @Policy(Policies.public())
  @AdminRoles(...OPS_ROLES)
  analytics(@CurrentAdmin() actor: AdminActor, @Req() request: Request) {
    return this.ops.analytics(actor, this.context(request));
  }

  @Get("audit-logs")
  @Policy(Policies.public())
  @AdminRoles(...OPS_ROLES)
  auditLogs(
    @Query() query: PageQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.ops.auditLogs(query, actor, this.context(request));
  }

  private context(request: Request): AdminRequestContext {
    return {
      ip: request.ip || request.socket.remoteAddress || null,
      ua: request.headers["user-agent"] ?? null,
    };
  }
}

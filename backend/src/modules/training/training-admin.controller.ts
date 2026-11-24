import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import {
  CourseDocumentDto,
  PublishReasonDto,
  StepImageCompleteDto,
  StepImageSignDto,
} from "./dto/training-admin.dto";
import { TrainingAdminService } from "./training-admin.service";
import { TrainingStepImagesService } from "./training-step-images.service";

/** Course authoring for the admin console (admin session + TOTP). */
@Controller("admin/training/courses")
@UseGuards(AdminSessionGuard)
export class TrainingAdminController {
  constructor(private readonly courses: TrainingAdminService) {}

  @Get()
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  list() {
    return this.courses.list();
  }

  @Get(":id")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  document(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.courses.document(id);
  }

  @Post()
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  create(
    @Body() body: CourseDocumentDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.courses.create(
      body.document,
      body.reason,
      actor,
      context(request),
    );
  }

  @Put(":id")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: CourseDocumentDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.courses.update(
      id,
      body.document,
      body.reason,
      actor,
      context(request),
    );
  }

  @Post(":id/publish")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  publish(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: PublishReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.courses.setPublished(
      id,
      true,
      body.reason,
      actor,
      context(request),
    );
  }

  @Post(":id/unpublish")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  unpublish(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: PublishReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.courses.setPublished(
      id,
      false,
      body.reason,
      actor,
      context(request),
    );
  }
}

/** Step pictures (upload purpose TRAINING_STEP_IMAGE): course editors only. */
@Controller("admin/training/step-images")
@UseGuards(AdminSessionGuard)
export class TrainingStepImagesController {
  constructor(private readonly images: TrainingStepImagesService) {}

  @Post("sign")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  sign(@Body() body: StepImageSignDto, @CurrentAdmin() actor: AdminActor) {
    return this.images.sign(actor.userId, body);
  }

  @Post("complete")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  complete(
    @Body() body: StepImageCompleteDto,
    @CurrentAdmin() actor: AdminActor,
  ) {
    return this.images.complete(actor.userId, body);
  }
}

function context(request: Request): AdminRequestContext {
  return {
    ip: request.ip || request.socket.remoteAddress || null,
    ua: request.headers["user-agent"] ?? null,
  };
}

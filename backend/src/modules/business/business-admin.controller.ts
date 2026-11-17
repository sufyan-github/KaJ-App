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
import { AdminActor } from "../admin-auth/admin-auth.types";
import { context } from "../learning/learning-admin.controller";
import { BusinessAdminService } from "./business-admin.service";
import { BusinessCategoryDto } from "./dto/business-admin.dto";

/** Admin console routes for KAAJ Business (admin session + TOTP). */
@Controller("admin")
@UseGuards(AdminSessionGuard)
export class BusinessAdminController {
  constructor(private readonly admin: BusinessAdminService) {}

  @Get("business-categories")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  categories() {
    return this.admin.categories();
  }

  @Post("business-categories")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  createCategory(
    @Body() body: BusinessCategoryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.admin.saveCategory(null, body, actor, context(request));
  }

  @Put("business-categories/:id")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  updateCategory(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: BusinessCategoryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.admin.saveCategory(id, body, actor, context(request));
  }
}

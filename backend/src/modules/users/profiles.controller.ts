import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";
import { RoleMode } from "@prisma/client";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateWorkerProfileDto } from "./dto/update-worker-profile.dto";
import { UpdateWorkerSkillsDto } from "./dto/update-worker-skills.dto";
import { UsersService } from "./users.service";
import { CreatePortfolioItemDto } from "./dto/create-portfolio-item.dto";
import { PortfolioService } from "./portfolio.service";
import { ReorderPortfolioItemsDto } from "./dto/reorder-portfolio-items.dto";
import { UpdatePortfolioItemDto } from "./dto/update-portfolio-item.dto";

@ApiTags("profiles")
@Controller("profiles/me")
export class ProfilesController {
  constructor(
    private readonly users: UsersService,
    private readonly portfolio: PortfolioService,
  ) {}

  @Get("portfolio")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  portfolioItems(@CurrentUser() claims: AccessTokenClaims) {
    return this.portfolio.list(claims.sub);
  }

  @Post("portfolio")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  addPortfolioItem(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreatePortfolioItemDto,
  ) {
    return this.portfolio.create(claims.sub, body);
  }

  @Patch("portfolio/:id")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  updatePortfolioItem(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdatePortfolioItemDto,
  ) {
    return this.portfolio.update(claims.sub, id, body);
  }

  @Put("portfolio/order")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  reorderPortfolioItems(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: ReorderPortfolioItemsDto,
  ) {
    return this.portfolio.reorder(claims.sub, body.itemIds);
  }

  @Delete("portfolio/:id")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  deletePortfolioItem(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.portfolio.remove(claims.sub, id);
  }

  @Put()
  @Policy(Policies.authenticated())
  updateProfile(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: UpdateProfileDto,
  ) {
    return this.users.updateProfile(claims.sub, body);
  }

  @Get("skills")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  getWorkerSkills(@CurrentUser() claims: AccessTokenClaims) {
    return this.users.getWorkerSkills(claims.sub);
  }

  @Put("skills")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  updateWorkerSkills(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: UpdateWorkerSkillsDto,
  ) {
    return this.users.updateWorkerSkills(claims.sub, body.skills);
  }

  @Put("worker")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  updateWorkerProfile(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: UpdateWorkerProfileDto,
  ) {
    return this.users.updateWorkerRates(claims.sub, body);
  }
}

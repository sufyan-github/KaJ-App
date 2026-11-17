import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import {
  AddIdeaMemberDto,
  ConvertIdeaDto,
  CreateIdeaDto,
  CreateIdeaRoleDto,
  IdeaAccessListQueryDto,
  IdeaSearchQueryDto,
  IdeaViewsQueryDto,
  RequestIdeaAccessDto,
  UpdateIdeaDto,
  UpdateIdeaRoleDto,
} from "./dto/idea.dto";
import { IdeaRolesService } from "./idea-roles.service";
import { IdeaTeamService } from "./idea-team.service";
import { IdeasService } from "./ideas.service";

const uuid = () => new ParseUUIDPipe();

/**
 * P2.7–P2.9: ideas, access to their private details, roles and matches,
 * the team and conversion. Owner-only routes use the idea-owner policy;
 * the rest decide in IdeasService.relationOr404. Either way, anyone who
 * may not see something gets 404.
 */
@ApiTags("ideas")
@Controller()
export class IdeasController {
  constructor(
    private readonly ideas: IdeasService,
    private readonly roles: IdeaRolesService,
    private readonly team: IdeaTeamService,
  ) {}

  @Get("me/ideas")
  @Policy(Policies.authenticated())
  mine(@CurrentUser() claims: AccessTokenClaims) {
    return this.ideas.mine(claims.sub);
  }

  @Get("me/idea-access")
  @Policy(Policies.authenticated())
  myAccess(@CurrentUser() claims: AccessTokenClaims) {
    return this.ideas.myAccess(claims.sub);
  }

  @Post("ideas")
  @Policy(Policies.authenticated())
  create(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreateIdeaDto,
  ) {
    return this.ideas.create(claims.sub, body);
  }

  @Get("ideas")
  @Policy(Policies.authenticated())
  search(
    @CurrentUser() claims: AccessTokenClaims,
    @Query() query: IdeaSearchQueryDto,
  ) {
    return this.ideas.search(claims.sub, query);
  }

  @Get("ideas/:id")
  @Policy(Policies.authenticated())
  get(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.ideas.get(claims.sub, id);
  }

  @Patch("ideas/:id")
  @Policy(Policies.ideaOwner())
  update(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: UpdateIdeaDto,
  ) {
    return this.ideas.update(claims.sub, id, body);
  }

  @Delete("ideas/:id")
  @Policy(Policies.ideaOwner())
  remove(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.ideas.remove(claims.sub, id);
  }

  // Access to the private details.

  @Post("ideas/:id/access-requests")
  @Policy(Policies.authenticated())
  requestAccess(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: RequestIdeaAccessDto,
  ) {
    return this.ideas.requestAccess(claims.sub, id, body);
  }

  @Get("ideas/:id/access-requests")
  @Policy(Policies.ideaOwner())
  accessList(
    @Param("id", uuid()) id: string,
    @Query() query: IdeaAccessListQueryDto,
  ) {
    return this.ideas.accessList(id, query);
  }

  @Post("ideas/:id/access-requests/:userId/approve")
  @Policy(Policies.ideaOwner())
  approve(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Param("userId", uuid()) userId: string,
  ) {
    return this.ideas.decideAccess(claims.sub, id, userId, "APPROVE");
  }

  @Post("ideas/:id/access-requests/:userId/decline")
  @Policy(Policies.ideaOwner())
  decline(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Param("userId", uuid()) userId: string,
  ) {
    return this.ideas.decideAccess(claims.sub, id, userId, "DECLINE");
  }

  @Post("ideas/:id/access/:userId/revoke")
  @Policy(Policies.ideaOwner())
  revoke(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Param("userId", uuid()) userId: string,
  ) {
    return this.ideas.decideAccess(claims.sub, id, userId, "REVOKE");
  }

  @Get("ideas/:id/views")
  @Policy(Policies.ideaOwner())
  views(@Param("id", uuid()) id: string, @Query() query: IdeaViewsQueryDto) {
    return this.ideas.views(id, query);
  }

  // P2.8 roles and matches.

  @Get("ideas/:id/roles")
  @Policy(Policies.authenticated())
  listRoles(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.roles.list(claims.sub, id);
  }

  @Post("ideas/:id/roles")
  @Policy(Policies.ideaOwner())
  createRole(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: CreateIdeaRoleDto,
  ) {
    return this.roles.create(claims.sub, id, body);
  }

  @Patch("ideas/:id/roles/:roleId")
  @Policy(Policies.ideaOwner())
  updateRole(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Param("roleId", uuid()) roleId: string,
    @Body() body: UpdateIdeaRoleDto,
  ) {
    return this.roles.update(claims.sub, id, roleId, body);
  }

  @Delete("ideas/:id/roles/:roleId")
  @Policy(Policies.ideaOwner())
  removeRole(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Param("roleId", uuid()) roleId: string,
  ) {
    return this.roles.remove(claims.sub, id, roleId);
  }

  @Get("ideas/:id/roles/:roleId/matches")
  @Policy(Policies.ideaOwner())
  matches(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Param("roleId", uuid()) roleId: string,
  ) {
    return this.roles.matches(claims.sub, id, roleId);
  }

  // P2.9 team and conversion.

  @Get("ideas/:id/members")
  @Policy(Policies.authenticated())
  members(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.team.members(claims.sub, id);
  }

  @Post("ideas/:id/members")
  @Policy(Policies.ideaOwner())
  addMember(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: AddIdeaMemberDto,
  ) {
    return this.team.add(claims.sub, id, body);
  }

  @Delete("ideas/:id/members/:userId")
  @Policy(Policies.authenticated())
  removeMember(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Param("userId", uuid()) userId: string,
  ) {
    return this.team.remove(claims.sub, id, userId);
  }

  /** P3.3: the idea room (team group chat): returns its conversation id. */
  @Post("ideas/:id/room")
  @Policy(Policies.authenticated())
  room(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.team.room(claims.sub, id);
  }

  @Post("ideas/:id/convert")
  @Policy(Policies.ideaOwner())
  convert(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: ConvertIdeaDto,
  ) {
    return this.team.convert(claims.sub, id, body);
  }
}

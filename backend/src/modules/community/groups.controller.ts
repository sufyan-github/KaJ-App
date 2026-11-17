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
  CreateGroupDto,
  GroupMemberRoleDto,
  GroupMembersQueryDto,
  GroupSearchQueryDto,
  InviteGroupMembersDto,
  UpdateGroupDto,
} from "./dto/community.dto";
import { GroupsService } from "./groups.service";

const uuid = () => new ParseUUIDPipe();

/** P3.4: community groups. Private groups and member lists: members only (404). */
@ApiTags("community")
@Controller()
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post("community/groups")
  @Policy(Policies.authenticated())
  create(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreateGroupDto,
  ) {
    return this.groups.create(claims.sub, body);
  }

  @Get("community/groups")
  @Policy(Policies.authenticated())
  search(
    @CurrentUser() claims: AccessTokenClaims,
    @Query() query: GroupSearchQueryDto,
  ) {
    return this.groups.search(claims.sub, query);
  }

  @Get("me/community/groups")
  @Policy(Policies.authenticated())
  mine(@CurrentUser() claims: AccessTokenClaims) {
    return this.groups.mine(claims.sub);
  }

  @Get("community/groups/:id")
  @Policy(Policies.authenticated())
  get(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.groups.get(claims.sub, id);
  }

  @Patch("community/groups/:id")
  @Policy(Policies.authenticated())
  update(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: UpdateGroupDto,
  ) {
    return this.groups.update(claims.sub, id, body);
  }

  /** Join a public group, ask to join a women-only one, or accept an invitation. */
  @Post("community/groups/:id/join")
  @Policy(Policies.authenticated())
  join(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.groups.join(claims.sub, id);
  }

  @Post("community/groups/:id/leave")
  @Policy(Policies.authenticated())
  leave(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.groups.leave(claims.sub, id);
  }

  @Get("community/groups/:id/members")
  @Policy(Policies.authenticated())
  members(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Query() query: GroupMembersQueryDto,
  ) {
    return this.groups.members(claims.sub, id, query);
  }

  @Post("community/groups/:id/members")
  @Policy(Policies.authenticated())
  invite(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: InviteGroupMembersDto,
  ) {
    return this.groups.invite(claims.sub, id, body);
  }

  @Post("community/groups/:id/members/:userId/approve")
  @Policy(Policies.authenticated())
  approve(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Param("userId", uuid()) userId: string,
  ) {
    return this.groups.approve(claims.sub, id, userId);
  }

  @Patch("community/groups/:id/members/:userId")
  @Policy(Policies.authenticated())
  changeRole(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Param("userId", uuid()) userId: string,
    @Body() body: GroupMemberRoleDto,
  ) {
    return this.groups.changeRole(claims.sub, id, userId, body);
  }

  @Delete("community/groups/:id/members/:userId")
  @Policy(Policies.authenticated())
  remove(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Param("userId", uuid()) userId: string,
  ) {
    return this.groups.remove(claims.sub, id, userId);
  }

  @Post("community/groups/:id/chat")
  @Policy(Policies.authenticated())
  chat(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.groups.chatRoom(claims.sub, id);
  }
}

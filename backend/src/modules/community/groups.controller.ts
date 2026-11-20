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
import { UserRateLimit } from "../../common/rate-limit/user-rate-limit";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { CreateGroupSessionDto } from "../experts/dto/session.dto";
import { SessionsService } from "../experts/sessions.service";
import {
  CreateGroupDto,
  GroupAnnouncementDto,
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
  constructor(
    private readonly groups: GroupsService,
    private readonly sessions: SessionsService,
  ) {}

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
  @UserRateLimit("invite")
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

  /** P3.5: the group's sessions and events (members only). */
  @Get("community/groups/:id/sessions")
  @Policy(Policies.authenticated())
  sessionsOf(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.sessions.groupSessions(claims.sub, id);
  }

  /** P3.5: a moderator or ambassador creates one (DRAFT; publish announces it). */
  @Post("community/groups/:id/sessions")
  @Policy(Policies.authenticated())
  createSession(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: CreateGroupSessionDto,
  ) {
    return this.sessions.createForGroup(claims.sub, id, body);
  }

  /** P3.6: group announcements (post: moderators and ambassadors). */
  @Get("community/groups/:id/announcements")
  @Policy(Policies.authenticated())
  announcements(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
  ) {
    return this.groups.announcements(claims.sub, id);
  }

  @Post("community/groups/:id/announcements")
  @Policy(Policies.authenticated())
  announce(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", uuid()) id: string,
    @Body() body: GroupAnnouncementDto,
  ) {
    return this.groups.announce(claims.sub, id, body.body);
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

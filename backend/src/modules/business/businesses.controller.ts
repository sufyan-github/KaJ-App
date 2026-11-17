import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { BusinessMemberRole } from "@prisma/client";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { BusinessesService } from "./businesses.service";
import {
  CreateBusinessDto,
  InviteBusinessMemberDto,
  SubmitBusinessVerificationDto,
  UpdateBusinessDto,
  UpdateBusinessMemberDto,
} from "./dto/business.dto";

const OWNER = [BusinessMemberRole.OWNER];
const EDITORS = [BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER];

/** P2.1: business profiles and their members. */
@ApiTags("business")
@Controller()
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Get("business-categories")
  @Policy(Policies.public())
  categories() {
    return this.businesses.categories();
  }

  @Get("me/businesses")
  @Policy(Policies.authenticated())
  mine(@CurrentUser() claims: AccessTokenClaims) {
    return this.businesses.mine(claims.sub);
  }

  @Post("businesses")
  @Policy(Policies.authenticated())
  create(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreateBusinessDto,
  ) {
    return this.businesses.create(claims.sub, body);
  }

  /** Members see everything; others the public parts of a public business. */
  @Get("businesses/:id")
  @Policy(Policies.authenticated())
  get(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.businesses.get(claims.sub, id);
  }

  @Patch("businesses/:id")
  @Policy(Policies.businessMember({ roles: EDITORS }))
  update(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateBusinessDto,
  ) {
    return this.businesses.update(claims.sub, id, body);
  }

  @Delete("businesses/:id")
  @Policy(Policies.businessMember({ roles: OWNER }))
  remove(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.businesses.remove(claims.sub, id);
  }

  @Get("businesses/:id/members")
  @Policy(Policies.businessMember())
  members(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.businesses.members(id);
  }

  @Post("businesses/:id/members")
  @Policy(Policies.businessMember({ roles: OWNER }))
  invite(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: InviteBusinessMemberDto,
  ) {
    return this.businesses.invite(claims.sub, id, body);
  }

  @Patch("businesses/:id/members/:userId")
  @Policy(Policies.businessMember({ roles: OWNER }))
  changeRole(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: UpdateBusinessMemberDto,
  ) {
    return this.businesses.changeRole(claims.sub, id, userId, body.role);
  }

  @Delete("businesses/:id/members/:userId")
  @Policy(Policies.businessMember({ roles: OWNER }))
  removeMember(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
  ) {
    return this.businesses.removeMember(claims.sub, id, userId);
  }

  /** P2.6: verification of a registered business (owner submits). */
  @Get("businesses/:id/verification")
  @Policy(Policies.businessMember())
  verification(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.businesses.verificationStatus(id);
  }

  @Post("businesses/:id/verification")
  @Policy(Policies.businessMember({ roles: OWNER }))
  submitVerification(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: SubmitBusinessVerificationDto,
  ) {
    return this.businesses.submitVerification(claims.sub, id, body);
  }

  /** The invitee accepts; DELETE leaves (or declines an invitation). */
  @Post("businesses/:id/membership/accept")
  @Policy(Policies.authenticated())
  accept(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.businesses.acceptInvitation(claims.sub, id);
  }

  @Delete("businesses/:id/membership")
  @Policy(Policies.authenticated())
  leave(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.businesses.leave(claims.sub, id);
  }
}

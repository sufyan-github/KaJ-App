import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { BusinessesService } from "./businesses.service";
import { CollaborationService } from "./collaboration.service";
import { PartnerDirectoryQueryDto } from "./dto/business.dto";
import {
  CollaborationActionDto,
  CollaborationListQueryDto,
  CreateCollaborationRequestDto,
} from "./dto/collaboration.dto";

/** P2.4 partner directory and P2.5 collaboration requests. */
@ApiTags("business")
@Controller()
export class CollaborationController {
  constructor(
    private readonly collaboration: CollaborationService,
    private readonly businesses: BusinessesService,
  ) {}

  @Get("partners")
  @Policy(Policies.authenticated())
  partners(
    @CurrentUser() claims: AccessTokenClaims,
    @Query() query: PartnerDirectoryQueryDto,
  ) {
    return this.businesses.partners(claims.sub, query);
  }

  @Post("collaboration-requests")
  @Policy(Policies.authenticated())
  create(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreateCollaborationRequestDto,
  ) {
    return this.collaboration.create(claims.sub, body);
  }

  @Get("collaboration-requests")
  @Policy(Policies.authenticated())
  list(
    @CurrentUser() claims: AccessTokenClaims,
    @Query() query: CollaborationListQueryDto,
  ) {
    return this.collaboration.list(claims.sub, query);
  }

  @Get("collaboration-requests/:id")
  @Policy(Policies.collaborationParticipant())
  get(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.collaboration.get(claims.sub, id);
  }

  @Post("collaboration-requests/:id/accept")
  @Policy(Policies.collaborationParticipant())
  accept(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: CollaborationActionDto,
  ) {
    return this.collaboration.act(claims.sub, id, "ACCEPT", body);
  }

  @Post("collaboration-requests/:id/decline")
  @Policy(Policies.collaborationParticipant())
  decline(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: CollaborationActionDto,
  ) {
    return this.collaboration.act(claims.sub, id, "DECLINE", body);
  }

  @Post("collaboration-requests/:id/withdraw")
  @Policy(Policies.collaborationParticipant())
  withdraw(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: CollaborationActionDto,
  ) {
    return this.collaboration.act(claims.sub, id, "WITHDRAW", body);
  }

  /** Both sides confirm "agreed in principle"; then the status is AGREED. */
  @Post("collaboration-requests/:id/agree")
  @Policy(Policies.collaborationParticipant())
  agree(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: CollaborationActionDto,
  ) {
    return this.collaboration.act(claims.sub, id, "AGREE", body);
  }

  @Post("collaboration-requests/:id/end")
  @Policy(Policies.collaborationParticipant())
  end(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: CollaborationActionDto,
  ) {
    return this.collaboration.act(claims.sub, id, "END", body);
  }
}

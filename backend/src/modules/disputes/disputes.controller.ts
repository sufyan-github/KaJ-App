import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import {
  AddDisputeEvidenceDto,
  AppealDisputeDto,
  OpenDisputeDto,
} from "./dto/disputes.dto";
import { DisputesService } from "./disputes.service";

@ApiTags("disputes")
@Controller()
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post("assignments/:id/disputes")
  @Policy(Policies.authenticated())
  open(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) assignmentId: string,
    @Body() body: OpenDisputeDto,
  ) {
    return this.disputes.open(claims.sub, assignmentId, body);
  }

  @Get("disputes")
  @Policy(Policies.authenticated())
  mine(@CurrentUser() claims: AccessTokenClaims) {
    return this.disputes.mine(claims.sub);
  }

  @Get("disputes/:id")
  @Policy(Policies.authenticated())
  detail(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.disputes.detail(claims.sub, id);
  }

  @Post("disputes/:id/evidence")
  @Policy(Policies.authenticated())
  addEvidence(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: AddDisputeEvidenceDto,
  ) {
    return this.disputes.addEvidence(claims.sub, id, body);
  }

  @Get("disputes/:id/evidence/:evidenceId/download")
  @Policy(Policies.authenticated())
  downloadEvidence(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("evidenceId", new ParseUUIDPipe()) evidenceId: string,
  ) {
    return this.disputes.downloadEvidence(claims.sub, id, evidenceId);
  }

  @Post("disputes/:id/appeal")
  @Policy(Policies.authenticated())
  appeal(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: AppealDisputeDto,
  ) {
    return this.disputes.appeal(claims.sub, id, body);
  }
}

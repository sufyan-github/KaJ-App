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
import { BusinessOfferingsService } from "./business-offerings.service";
import { BusinessesService } from "./businesses.service";
import { CreateOfferingDto, UpdateOfferingDto } from "./dto/offering.dto";

const EDITORS = [BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER];

/** P2.2 offerings and P2.3 a business's staff jobs. */
@ApiTags("business")
@Controller("businesses/:id")
export class BusinessOfferingsController {
  constructor(
    private readonly offerings: BusinessOfferingsService,
    private readonly businesses: BusinessesService,
  ) {}

  @Get("offerings")
  @Policy(Policies.authenticated())
  list(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.offerings.list(claims.sub, id);
  }

  @Post("offerings")
  @Policy(Policies.businessMember({ roles: EDITORS }))
  create(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: CreateOfferingDto,
  ) {
    return this.offerings.create(claims.sub, id, body);
  }

  @Patch("offerings/:offeringId")
  @Policy(Policies.businessMember({ roles: EDITORS }))
  update(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("offeringId", new ParseUUIDPipe()) offeringId: string,
    @Body() body: UpdateOfferingDto,
  ) {
    return this.offerings.update(claims.sub, id, offeringId, body);
  }

  @Delete("offerings/:offeringId")
  @Policy(Policies.businessMember({ roles: EDITORS }))
  remove(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("offeringId", new ParseUUIDPipe()) offeringId: string,
  ) {
    return this.offerings.remove(claims.sub, id, offeringId);
  }

  @Get("jobs")
  @Policy(Policies.authenticated())
  jobs(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.businesses.jobs(claims.sub, id);
  }
}

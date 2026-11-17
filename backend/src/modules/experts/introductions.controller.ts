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
import {
  AcceptIntroductionDto,
  CreateIntroductionDto,
  DeclineIntroductionDto,
  IntroductionListQueryDto,
} from "./dto/introduction.dto";
import { IntroductionsService } from "./introductions.service";

/** P3.1: introductions to experts. Non-participants get 404. */
@ApiTags("experts")
@Controller("introductions")
export class IntroductionsController {
  constructor(private readonly introductions: IntroductionsService) {}

  @Post()
  @Policy(Policies.authenticated())
  create(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreateIntroductionDto,
  ) {
    return this.introductions.create(claims.sub, body);
  }

  @Get()
  @Policy(Policies.authenticated())
  list(
    @CurrentUser() claims: AccessTokenClaims,
    @Query() query: IntroductionListQueryDto,
  ) {
    return this.introductions.list(claims.sub, query);
  }

  @Get(":id")
  @Policy(Policies.authenticated())
  get(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.introductions.get(claims.sub, id);
  }

  @Post(":id/accept")
  @Policy(Policies.authenticated())
  accept(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: AcceptIntroductionDto,
  ) {
    return this.introductions.act(claims.sub, id, "ACCEPT", body);
  }

  @Post(":id/decline")
  @Policy(Policies.authenticated())
  decline(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: DeclineIntroductionDto,
  ) {
    return this.introductions.act(claims.sub, id, "DECLINE", body);
  }

  @Post(":id/withdraw")
  @Policy(Policies.authenticated())
  withdraw(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.introductions.act(claims.sub, id, "WITHDRAW");
  }
}

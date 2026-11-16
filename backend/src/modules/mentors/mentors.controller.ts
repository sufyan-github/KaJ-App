import { Body, Controller, Get, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import {
  MentorApplicationDto,
  MentorDirectoryQueryDto,
  UpdateMentorDto,
} from "./dto/mentor.dto";
import { MentorsService } from "./mentors.service";

@ApiTags("mentors")
@Controller()
export class MentorsController {
  constructor(private readonly mentors: MentorsService) {}

  @Get("me/mentor")
  @Policy(Policies.authenticated())
  mine(@CurrentUser() claims: AccessTokenClaims) {
    return this.mentors.get(claims.sub);
  }

  @Post("me/mentor/application")
  @Policy(Policies.authenticated())
  apply(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: MentorApplicationDto,
  ) {
    return this.mentors.apply(claims.sub, body);
  }

  @Put("me/mentor")
  @Policy(Policies.authenticated())
  update(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: UpdateMentorDto,
  ) {
    return this.mentors.update(claims.sub, body);
  }

  @Get("mentors")
  @Policy(Policies.authenticated())
  directory(
    @CurrentUser() claims: AccessTokenClaims,
    @Query() query: MentorDirectoryQueryDto,
  ) {
    return this.mentors.directory(claims.sub, query);
  }
}

import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { PublicProfilesService } from "./public-profiles.service";
import { WorkerDirectoryQueryDto } from "./dto/worker-directory-query.dto";

/**
 * API-6: the directory and public profiles need a sign-in, so blocks and
 * "left the directory" always apply and nobody scrapes them anonymously.
 */
@ApiTags("users")
@Controller("users")
export class PublicProfilesController {
  constructor(private readonly profiles: PublicProfilesService) {}

  @Get("workers")
  @Policy(Policies.authenticated())
  listWorkers(
    @Query() query: WorkerDirectoryQueryDto,
    @CurrentUser() claims: AccessTokenClaims,
  ) {
    return this.profiles.listWorkers(
      query.skillId,
      query.locationId,
      claims.sub,
    );
  }

  @Get(":id/public")
  @Policy(Policies.authenticated())
  getPublicWorkerProfile(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() claims: AccessTokenClaims,
  ) {
    return this.profiles.getWorkerProfile(id, claims.sub);
  }
}

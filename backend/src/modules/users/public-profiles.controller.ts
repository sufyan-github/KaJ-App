import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Request } from "express";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AuthTokenService } from "../auth/auth-token.service";
import { PublicProfilesService } from "./public-profiles.service";
import { WorkerDirectoryQueryDto } from "./dto/worker-directory-query.dto";

@ApiTags("users")
@Controller("users")
export class PublicProfilesController {
  constructor(
    private readonly profiles: PublicProfilesService,
    private readonly tokens: AuthTokenService,
  ) {}

  @Get("workers")
  @Policy(Policies.public())
  async listWorkers(
    @Query() query: WorkerDirectoryQueryDto,
    @Req() request: Request,
  ) {
    return this.profiles.listWorkers(
      query.skillId,
      query.locationId,
      await this.optionalViewer(request),
    );
  }

  @Get(":id/public")
  @Policy(Policies.public())
  async getPublicWorkerProfile(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ) {
    return this.profiles.getWorkerProfile(
      id,
      await this.optionalViewer(request),
    );
  }

  /**
   * These routes stay public, but a signed-in viewer is identified so blocks
   * apply. A missing or invalid token just means an anonymous viewer.
   */
  private async optionalViewer(request: Request): Promise<string | undefined> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return undefined;
    try {
      return (await this.tokens.verifyAccessToken(header.slice(7))).sub;
    } catch {
      return undefined;
    }
  }
}

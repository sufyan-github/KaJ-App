import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { PublicProfilesService } from "./public-profiles.service";

@ApiTags("users")
@Controller("users")
export class PublicProfilesController {
  constructor(private readonly profiles: PublicProfilesService) {}

  @Get(":id/public")
  @Policy(Policies.public())
  getPublicWorkerProfile(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.profiles.getWorkerProfile(id);
  }
}

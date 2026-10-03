import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { PublicProfilesService } from "./public-profiles.service";
import { WorkerDirectoryQueryDto } from "./dto/worker-directory-query.dto";

@ApiTags("users")
@Controller("users")
export class PublicProfilesController {
  constructor(private readonly profiles: PublicProfilesService) {}

  @Get("workers")
  @Policy(Policies.public())
  listWorkers(@Query() query: WorkerDirectoryQueryDto) {
    return this.profiles.listWorkers(query.skillId, query.locationId);
  }

  @Get(":id/public")
  @Policy(Policies.public())
  getPublicWorkerProfile(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.profiles.getWorkerProfile(id);
  }
}

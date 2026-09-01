import { Module } from "@nestjs/common";

import { ProfilesController } from "./profiles.controller";
import { PublicProfilesController } from "./public-profiles.controller";
import { PublicProfilesService } from "./public-profiles.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [ProfilesController, PublicProfilesController, UsersController],
  providers: [PublicProfilesService, UsersService],
})
export class UsersModule {}

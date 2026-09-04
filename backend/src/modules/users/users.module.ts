import { Module } from "@nestjs/common";

import { ProfilesController } from "./profiles.controller";
import { PublicProfilesController } from "./public-profiles.controller";
import { PublicProfilesService } from "./public-profiles.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { PortfolioService } from "./portfolio.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [ProfilesController, PublicProfilesController, UsersController],
  providers: [PortfolioService, PublicProfilesService, UsersService],
})
export class UsersModule {}

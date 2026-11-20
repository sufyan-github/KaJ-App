import { Module } from "@nestjs/common";

import { ProfilesController } from "./profiles.controller";
import { PublicProfilesController } from "./public-profiles.controller";
import { PublicProfilesService } from "./public-profiles.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { PortfolioService } from "./portfolio.service";
import { AuthModule } from "../auth/auth.module";
import { TrainingModule } from "../training/training.module";
import { AccountPurgeRunner } from "./account-purge.runner";
import { AccountPurgeService } from "./account-purge.service";
import { ProfileOverviewService } from "./profile-overview.service";

@Module({
  imports: [AuthModule, TrainingModule],
  controllers: [ProfilesController, PublicProfilesController, UsersController],
  providers: [
    AccountPurgeRunner,
    AccountPurgeService,
    PortfolioService,
    ProfileOverviewService,
    PublicProfilesService,
    UsersService,
  ],
})
export class UsersModule {}

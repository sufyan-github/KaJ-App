import { Module } from "@nestjs/common";

import { BusinessModule } from "../business/business.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { IdeaRolesService } from "./idea-roles.service";
import { IdeaTeamService } from "./idea-team.service";
import { IdeasController } from "./ideas.controller";
import { IdeasService } from "./ideas.service";

/** P2.7–P2.9: ideas, their private details, roles, team and conversion. */
@Module({
  imports: [BusinessModule, NotificationsModule],
  controllers: [IdeasController],
  providers: [IdeasService, IdeaRolesService, IdeaTeamService],
  exports: [IdeasService],
})
export class IdeasModule {}

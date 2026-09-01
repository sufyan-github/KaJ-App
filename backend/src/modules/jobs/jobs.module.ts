import { Module } from "@nestjs/common";

import { AvailabilityModule } from "../availability/availability.module";
import { MatchingModule } from "../matching/matching.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AssignmentLifecycleRunner } from "./assignment-lifecycle.runner";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [AvailabilityModule, MatchingModule, NotificationsModule],
  controllers: [JobsController],
  providers: [JobsService, AssignmentLifecycleRunner],
})
export class JobsModule {}

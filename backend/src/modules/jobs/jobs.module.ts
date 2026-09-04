import { Module } from "@nestjs/common";

import { AvailabilityModule } from "../availability/availability.module";
import { MatchingModule } from "../matching/matching.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ChatModule } from "../chat/chat.module";
import { AssignmentLifecycleRunner } from "./assignment-lifecycle.runner";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { RecurrenceRunner } from "./recurrence/recurrence.runner";
import { RecurrenceService } from "./recurrence/recurrence.service";

@Module({
  imports: [
    AvailabilityModule,
    ChatModule,
    MatchingModule,
    NotificationsModule,
  ],
  controllers: [JobsController],
  providers: [
    JobsService,
    AssignmentLifecycleRunner,
    RecurrenceService,
    RecurrenceRunner,
  ],
})
export class JobsModule {}

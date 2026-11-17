import { Module } from "@nestjs/common";

import { AvailabilityModule } from "../availability/availability.module";
import { MentorsModule } from "../mentors/mentors.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { IntroductionsController } from "./introductions.controller";
import { IntroductionsRunner } from "./introductions.runner";
import { IntroductionsService } from "./introductions.service";
import { SessionsController } from "./sessions.controller";
import { SessionsRunner } from "./sessions.runner";
import { SessionsService } from "./sessions.service";

/** P3: experts — introductions and sessions. */
@Module({
  imports: [AvailabilityModule, MentorsModule, NotificationsModule],
  controllers: [IntroductionsController, SessionsController],
  providers: [
    IntroductionsService,
    IntroductionsRunner,
    SessionsService,
    SessionsRunner,
  ],
  exports: [IntroductionsService, SessionsService],
})
export class ExpertsModule {}

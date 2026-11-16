import { Module } from "@nestjs/common";

import { MentorsModule } from "../mentors/mentors.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { LearningEnrolmentsController } from "./learning-enrolments.controller";
import { LearningEnrolmentsService } from "./learning-enrolments.service";
import { LearningController } from "./learning.controller";
import { LearningService } from "./learning.service";

@Module({
  imports: [MentorsModule, NotificationsModule],
  controllers: [LearningController, LearningEnrolmentsController],
  providers: [LearningService, LearningEnrolmentsService],
  exports: [LearningService, LearningEnrolmentsService],
})
export class LearningModule {}

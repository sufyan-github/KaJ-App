import { Module } from "@nestjs/common";

import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { MentorsModule } from "../mentors/mentors.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { LearningEnrolmentsController } from "./learning-enrolments.controller";
import { LearningEnrolmentsService } from "./learning-enrolments.service";
import { LearningAdminController } from "./learning-admin.controller";
import { LearningAdminService } from "./learning-admin.service";
import { LearningController } from "./learning.controller";
import { LearningService } from "./learning.service";

@Module({
  imports: [AdminAuthModule, MentorsModule, NotificationsModule],
  controllers: [
    LearningController,
    LearningEnrolmentsController,
    LearningAdminController,
  ],
  providers: [LearningService, LearningEnrolmentsService, LearningAdminService],
  exports: [LearningService, LearningEnrolmentsService],
})
export class LearningModule {}

import { Module } from "@nestjs/common";

import { MentorsModule } from "../mentors/mentors.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { LearningController } from "./learning.controller";
import { LearningService } from "./learning.service";

@Module({
  imports: [MentorsModule, NotificationsModule],
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}

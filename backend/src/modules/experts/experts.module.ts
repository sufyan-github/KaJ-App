import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { IntroductionsController } from "./introductions.controller";
import { IntroductionsRunner } from "./introductions.runner";
import { IntroductionsService } from "./introductions.service";

/** P3: experts — introductions and (P3.2) sessions. */
@Module({
  imports: [NotificationsModule],
  controllers: [IntroductionsController],
  providers: [IntroductionsService, IntroductionsRunner],
  exports: [IntroductionsService],
})
export class ExpertsModule {}

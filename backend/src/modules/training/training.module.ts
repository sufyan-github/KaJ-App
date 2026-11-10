import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TrainingAttemptsService } from "./training-attempts.service";
import { TrainingCertificatesService } from "./training-certificates.service";
import { TrainingController } from "./training.controller";
import { TrainingCoursesService } from "./training-courses.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [TrainingController],
  providers: [
    TrainingAttemptsService,
    TrainingCertificatesService,
    TrainingCoursesService,
  ],
  exports: [TrainingCertificatesService],
})
export class TrainingModule {}

import { Module } from "@nestjs/common";

import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import {
  TrainingAdminController,
  TrainingStepImagesController,
} from "./training-admin.controller";
import { TrainingAdminService } from "./training-admin.service";
import { TrainingAttemptsService } from "./training-attempts.service";
import { TrainingCertificatesService } from "./training-certificates.service";
import { TrainingController } from "./training.controller";
import { TrainingCoursesService } from "./training-courses.service";
import { TrainingCheckpointsService } from "./training-checkpoints.service";
import { TrainingStepImagesService } from "./training-step-images.service";

@Module({
  imports: [AdminAuthModule, AuthModule, NotificationsModule],
  controllers: [
    TrainingController,
    TrainingAdminController,
    TrainingStepImagesController,
  ],
  providers: [
    TrainingAdminService,
    TrainingAttemptsService,
    TrainingCertificatesService,
    TrainingCoursesService,
    TrainingCheckpointsService,
    TrainingStepImagesService,
  ],
  exports: [TrainingCertificatesService],
})
export class TrainingModule {}

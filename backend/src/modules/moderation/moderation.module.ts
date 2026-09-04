import { Module } from "@nestjs/common";

import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { ModerationAdminController } from "./moderation-admin.controller";
import { ModerationController } from "./moderation.controller";
import { ModerationService } from "./moderation.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [ModerationController, ModerationAdminController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}

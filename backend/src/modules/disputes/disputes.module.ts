import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { DisputeLifecycleRunner } from "./dispute-lifecycle.runner";
import { DisputesController } from "./disputes.controller";
import { DisputesService } from "./disputes.service";

@Module({
  imports: [NotificationsModule],
  controllers: [DisputesController],
  providers: [DisputeLifecycleRunner, DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}

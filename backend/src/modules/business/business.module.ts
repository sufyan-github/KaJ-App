import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { BusinessesController } from "./businesses.controller";
import { BusinessesService } from "./businesses.service";

/** P2: Business — profiles, members, offerings, partners, collaboration. */
@Module({
  imports: [NotificationsModule],
  controllers: [BusinessesController],
  providers: [BusinessesService],
  exports: [BusinessesService],
})
export class BusinessModule {}

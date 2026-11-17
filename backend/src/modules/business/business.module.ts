import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { BusinessOfferingsController } from "./business-offerings.controller";
import { BusinessOfferingsService } from "./business-offerings.service";
import { BusinessesController } from "./businesses.controller";
import { BusinessesService } from "./businesses.service";

/** P2: Business — profiles, members, offerings, partners, collaboration. */
@Module({
  imports: [NotificationsModule],
  controllers: [BusinessesController, BusinessOfferingsController],
  providers: [BusinessesService, BusinessOfferingsService],
  exports: [BusinessesService, BusinessOfferingsService],
})
export class BusinessModule {}

import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { BusinessOfferingsController } from "./business-offerings.controller";
import { BusinessOfferingsService } from "./business-offerings.service";
import { BusinessesController } from "./businesses.controller";
import { CollaborationController } from "./collaboration.controller";
import { CollaborationService } from "./collaboration.service";
import { BusinessesService } from "./businesses.service";

/** P2: Business — profiles, members, offerings, partners, collaboration. */
@Module({
  imports: [NotificationsModule],
  controllers: [
    BusinessesController,
    BusinessOfferingsController,
    CollaborationController,
  ],
  providers: [
    BusinessesService,
    BusinessOfferingsService,
    CollaborationService,
  ],
  exports: [BusinessesService, BusinessOfferingsService, CollaborationService],
})
export class BusinessModule {}

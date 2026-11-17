import { Module } from "@nestjs/common";

import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { VerificationModule } from "../verification/verification.module";
import { BusinessOfferingsController } from "./business-offerings.controller";
import { BusinessOfferingsService } from "./business-offerings.service";
import { BusinessAdminController } from "./business-admin.controller";
import { BusinessAdminService } from "./business-admin.service";
import { BusinessesController } from "./businesses.controller";
import { CollaborationController } from "./collaboration.controller";
import { CollaborationService } from "./collaboration.service";
import { BusinessesService } from "./businesses.service";

/** P2: Business — profiles, members, offerings, partners, collaboration. */
@Module({
  imports: [AdminAuthModule, NotificationsModule, VerificationModule],
  controllers: [
    BusinessesController,
    BusinessOfferingsController,
    CollaborationController,
    BusinessAdminController,
  ],
  providers: [
    BusinessAdminService,
    BusinessesService,
    BusinessOfferingsService,
    CollaborationService,
  ],
  exports: [BusinessesService, BusinessOfferingsService, CollaborationService],
})
export class BusinessModule {}

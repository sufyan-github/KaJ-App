import { Module } from "@nestjs/common";

import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { SubscriptionGuard } from "./subscription.guard";
import { SubscriptionsAdminController } from "./subscriptions-admin.controller";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

@Module({
  controllers: [SubscriptionsController, SubscriptionsAdminController],
  imports: [AdminAuthModule],
  providers: [SubscriptionGuard, SubscriptionsService],
  exports: [SubscriptionGuard, SubscriptionsService],
})
export class SubscriptionsModule {}

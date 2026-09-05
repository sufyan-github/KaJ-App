import { Module } from "@nestjs/common";

import { RedisModule } from "../../infra/redis/redis.module";
import { PaymentsController } from "./payments.controller";
import { LedgerService } from "./ledger.service";
import { PaymentsService } from "./payments.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { PaymentsAdminController } from "./payments-admin.controller";

@Module({
  imports: [AdminAuthModule, NotificationsModule, RedisModule],
  controllers: [PaymentsController, PaymentsAdminController],
  providers: [LedgerService, PaymentsService],
  exports: [LedgerService, PaymentsService],
})
export class PaymentsModule {}

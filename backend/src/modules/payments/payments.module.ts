import { Module } from "@nestjs/common";

import { RedisModule } from "../../infra/redis/redis.module";
import { PaymentsController } from "./payments.controller";
import { LedgerService } from "./ledger.service";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [RedisModule],
  controllers: [PaymentsController],
  providers: [LedgerService, PaymentsService],
  exports: [LedgerService, PaymentsService],
})
export class PaymentsModule {}

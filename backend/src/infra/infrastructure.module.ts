import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { BdappsGatewayClient } from "./bdapps/bdapps-gateway.client";
import { BdappsWebhookVerifier } from "./bdapps/bdapps-webhook.verifier";
import { BdappsOperatorAdapter } from "./operator/bdapps.adapter";
import { ManualPaymentAdapter } from "./payment/manual.adapter";
import { PAYMENT_PORT } from "./payment/payment.port";
import { OPERATOR_PORT } from "./operator/operator.port";
import { PendingOperatorAdapter } from "./operator/pending.adapter";
import { selectOperatorAdapter } from "./operator/operator.provider";
import { DisabledPushAdapter } from "./push/disabled.adapter";
import { PUSH_PORT } from "./push/push.port";
import { RedisModule } from "./redis/redis.module";
import { BdappsSmsAdapter } from "./sms/bdapps.adapter";
import { ConsoleSmsAdapter } from "./sms/console.adapter";
import { DisabledSmsAdapter } from "./sms/disabled.adapter";
import { SMS_PORT, SmsPort } from "./sms/sms.port";
import { selectSmsAdapter } from "./sms/sms.provider";
import { S3StorageAdapter } from "./storage/s3.adapter";
import { STORAGE_PORT } from "./storage/storage.port";

@Global()
@Module({
  exports: [
    BdappsWebhookVerifier,
    OPERATOR_PORT,
    PAYMENT_PORT,
    PUSH_PORT,
    SMS_PORT,
    STORAGE_PORT,
  ],
  imports: [RedisModule],
  providers: [
    BdappsGatewayClient,
    BdappsWebhookVerifier,
    BdappsOperatorAdapter,
    BdappsSmsAdapter,
    ConsoleSmsAdapter,
    DisabledSmsAdapter,
    DisabledPushAdapter,
    ManualPaymentAdapter,
    PendingOperatorAdapter,
    S3StorageAdapter,
    {
      inject: [
        ConfigService,
        ConsoleSmsAdapter,
        DisabledSmsAdapter,
        BdappsSmsAdapter,
      ],
      provide: SMS_PORT,
      useFactory: (
        config: ConfigService,
        consoleAdapter: ConsoleSmsAdapter,
        disabledAdapter: DisabledSmsAdapter,
        bdappsAdapter: BdappsSmsAdapter,
      ): SmsPort =>
        selectSmsAdapter(
          config.get<string>("SMS_PROVIDER", "console"),
          consoleAdapter,
          disabledAdapter,
          bdappsAdapter,
        ),
    },
    { provide: PUSH_PORT, useExisting: DisabledPushAdapter },
    { provide: STORAGE_PORT, useExisting: S3StorageAdapter },
    { provide: PAYMENT_PORT, useExisting: ManualPaymentAdapter },
    {
      inject: [ConfigService, PendingOperatorAdapter, BdappsOperatorAdapter],
      provide: OPERATOR_PORT,
      useFactory: (
        config: ConfigService,
        pendingAdapter: PendingOperatorAdapter,
        bdappsAdapter: BdappsOperatorAdapter,
      ): import("./operator/operator.port").OperatorPort =>
        selectOperatorAdapter(
          config.get<string>("OPERATOR_PROVIDER", "pending"),
          pendingAdapter,
          bdappsAdapter,
        ),
    },
  ],
})
export class InfrastructureModule {}

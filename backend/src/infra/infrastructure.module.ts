import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ManualPaymentAdapter } from "./payment/manual.adapter";
import { PAYMENT_PORT } from "./payment/payment.port";
import { DisabledPushAdapter } from "./push/disabled.adapter";
import { PUSH_PORT } from "./push/push.port";
import { ConsoleSmsAdapter } from "./sms/console.adapter";
import { DisabledSmsAdapter } from "./sms/disabled.adapter";
import { SMS_PORT, SmsPort } from "./sms/sms.port";
import { selectSmsAdapter } from "./sms/sms.provider";
import { S3StorageAdapter } from "./storage/s3.adapter";
import { STORAGE_PORT } from "./storage/storage.port";

@Global()
@Module({
  exports: [PAYMENT_PORT, PUSH_PORT, SMS_PORT, STORAGE_PORT],
  providers: [
    ConsoleSmsAdapter,
    DisabledSmsAdapter,
    DisabledPushAdapter,
    ManualPaymentAdapter,
    S3StorageAdapter,
    {
      inject: [ConfigService, ConsoleSmsAdapter, DisabledSmsAdapter],
      provide: SMS_PORT,
      useFactory: (
        config: ConfigService,
        consoleAdapter: ConsoleSmsAdapter,
        disabledAdapter: DisabledSmsAdapter,
      ): SmsPort =>
        selectSmsAdapter(
          config.get<string>("SMS_PROVIDER", "console"),
          consoleAdapter,
          disabledAdapter,
        ),
    },
    { provide: PUSH_PORT, useExisting: DisabledPushAdapter },
    { provide: STORAGE_PORT, useExisting: S3StorageAdapter },
    { provide: PAYMENT_PORT, useExisting: ManualPaymentAdapter },
  ],
})
export class InfrastructureModule {}

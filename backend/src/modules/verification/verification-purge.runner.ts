import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { VerificationService } from "./verification.service";

@Injectable()
export class VerificationPurgeRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VerificationPurgeRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly verification: VerificationService) {}

  onModuleInit() {
    this.run();
    this.timer = setInterval(() => this.run(), 24 * 60 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private run() {
    void this.verification.purgeExpiredDocuments().catch((error: unknown) => {
      this.logger.error(
        error instanceof Error
          ? error.message
          : "Verification document purge failed",
      );
    });
  }
}

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { schedulersEnabled } from "../../common/scheduling/schedulers-enabled";
import { AccountPurgeService } from "./account-purge.service";

/** PRIV-1: once a day, purge accounts past the deletion grace period. */
@Injectable()
export class AccountPurgeRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountPurgeRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly purge: AccountPurgeService) {}

  onModuleInit() {
    if (!schedulersEnabled()) return;
    this.run();
    this.timer = setInterval(() => this.run(), 24 * 60 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private run() {
    void this.purge.purgeDue().catch((error: unknown) => {
      this.logger.error(
        error instanceof Error ? error.message : "Account purge failed",
      );
    });
  }
}

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { DisputesService } from "./disputes.service";

@Injectable()
export class DisputeLifecycleRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DisputeLifecycleRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly disputes: DisputesService) {}

  onModuleInit() {
    this.run();
    this.timer = setInterval(() => this.run(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private run() {
    void this.disputes.reconcileDueDisputes().catch((error: unknown) => {
      this.logger.error(
        error instanceof Error ? error.message : "Dispute lifecycle failed",
      );
    });
  }
}

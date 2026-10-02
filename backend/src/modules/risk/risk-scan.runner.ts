import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { RiskService } from "./risk.service";

const DAILY_SCAN_INTERVAL_MS = 24 * 60 * 60_000;

@Injectable()
export class RiskScanRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RiskScanRunner.name);
  private timer?: NodeJS.Timeout;
  private pending?: Promise<void>;
  private stopping = false;

  constructor(private readonly risk: RiskService) {}

  onModuleInit() {
    this.run();
    this.timer = setInterval(() => this.run(), DAILY_SCAN_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.pending;
  }

  private run() {
    if (this.stopping || this.pending) return;
    this.pending = Promise.resolve()
      .then(() =>
        this.risk.scan(
          "Scheduled daily deterministic risk scan for human review.",
          null,
          {
            ip: null,
            ua: "system:risk-scan-runner",
          },
        ),
      )
      .then(() => undefined)
      .catch(() => {
        // Database errors may contain connection details or private query data.
        this.logger.error("Daily risk scan failed");
      })
      .finally(() => {
        this.pending = undefined;
      });
  }
}

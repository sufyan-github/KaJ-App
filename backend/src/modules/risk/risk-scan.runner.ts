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

  constructor(private readonly risk: RiskService) {}

  onModuleInit() {
    this.run();
    this.timer = setInterval(() => this.run(), DAILY_SCAN_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private run() {
    void this.risk
      .scan("Scheduled daily deterministic risk scan for human review.", null, {
        ip: null,
        ua: "system:risk-scan-runner",
      })
      .catch((error: unknown) => {
        this.logger.error(
          error instanceof Error ? error.message : "Daily risk scan failed",
        );
      });
  }
}

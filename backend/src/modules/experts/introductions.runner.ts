import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { schedulersEnabled } from "../../common/scheduling/schedulers-enabled";
import { IntroductionsService } from "./introductions.service";

/** Expires introduction requests left unanswered for 7 days. */
@Injectable()
export class IntroductionsRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntroductionsRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly introductions: IntroductionsService) {}

  onModuleInit() {
    if (!schedulersEnabled()) return;
    this.run();
    this.timer = setInterval(() => this.run(), 10 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private run() {
    void this.introductions.expireDue().catch((error: unknown) => {
      this.logger.error(
        error instanceof Error ? error.message : "Introduction expiry failed",
      );
    });
  }
}

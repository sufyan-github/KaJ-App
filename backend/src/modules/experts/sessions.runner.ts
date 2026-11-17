import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { schedulersEnabled } from "../../common/scheduling/schedulers-enabled";
import { SessionsService } from "./sessions.service";

/** Sends session reminders an hour ahead. */
@Injectable()
export class SessionsRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionsRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly sessions: SessionsService) {}

  onModuleInit() {
    if (!schedulersEnabled()) return;
    this.run();
    this.timer = setInterval(() => this.run(), 5 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private run() {
    void this.sessions.sendReminders().catch((error: unknown) => {
      this.logger.error(
        error instanceof Error ? error.message : "Session reminders failed",
      );
    });
  }
}

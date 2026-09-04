import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { RecurrenceService } from "./recurrence.service";

@Injectable()
export class RecurrenceRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecurrenceRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly recurrence: RecurrenceService) {}

  onModuleInit() {
    this.run();
    this.timer = setInterval(() => this.run(), 60 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private run() {
    void this.recurrence.generateAll().catch((error: unknown) => {
      this.logger.error(
        error instanceof Error ? error.message : "Recurrence generation failed",
      );
    });
  }
}

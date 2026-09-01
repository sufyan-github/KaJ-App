import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { JobsService } from "./jobs.service";

@Injectable()
export class AssignmentLifecycleRunner
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AssignmentLifecycleRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly jobs: JobsService) {}

  onModuleInit() {
    this.run();
    this.timer = setInterval(() => this.run(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private run() {
    void this.jobs.reconcileDueAssignments().catch((error: unknown) => {
      this.logger.error(
        error instanceof Error
          ? error.message
          : "Assignment reconciliation failed",
      );
    });
  }
}

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { ReviewsService } from "./reviews.service";

@Injectable()
export class ReputationRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReputationRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly reviews: ReviewsService) {}

  onModuleInit() {
    this.run();
    this.timer = setInterval(() => this.run(), 24 * 60 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private run() {
    void this.reviews.recomputeAllReputation().catch((error: unknown) => {
      this.logger.error(
        error instanceof Error ? error.message : "Reputation refresh failed",
      );
    });
  }
}

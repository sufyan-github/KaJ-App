import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { schedulersEnabled } from "../../common/scheduling/schedulers-enabled";
import { AdminOpsService } from "./admin-ops.service";

/** `throttlePerMinute` is per minute, so one batch per campaign per tick. */
export const CAMPAIGN_TICK_MS = 60_000;

/**
 * Sends the remaining batches of admin notification campaigns. Before this,
 * a campaign stopped after its first batch and stayed PARTIAL.
 */
@Injectable()
export class CampaignRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignRunner.name);
  private timer?: NodeJS.Timeout;
  private pending?: Promise<void>;
  private stopping = false;

  constructor(private readonly ops: AdminOpsService) {}

  onModuleInit() {
    if (!schedulersEnabled()) return;
    this.timer = setInterval(() => this.run(), CAMPAIGN_TICK_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.pending;
  }

  /** One tick; resolves when the tick is done. Ignored while one runs. */
  run(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.ops
      .continueCampaigns()
      .then(() => undefined)
      .catch(() => {
        // Database errors may contain connection details or private data.
        this.logger.error("Campaign batch failed");
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
}

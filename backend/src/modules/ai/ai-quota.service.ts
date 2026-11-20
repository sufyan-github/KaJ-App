import { Inject, Injectable, Logger } from "@nestjs/common";
import { AiFeature } from "@prisma/client";

import { KajHttpException } from "../../common/errors/kaj-http.exception";
import { CLOCK, Clock } from "../../common/time/clock";
import { RedisService } from "../../infra/redis/redis.service";
import { aiErrors } from "./ai.errors";
import { AiSettings } from "./ai.settings";

/** Minimal Redis surface the quota needs (a fake implements it in tests). */
export interface QuotaStore {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // Asia/Dhaka is UTC+6, no DST.
const KEY_TTL_SECONDS = 2 * 24 * 60 * 60;

/** A claimed quota slot: release() gives it back (provider errors only). */
export interface QuotaTicket {
  release(): Promise<void>;
}

/**
 * Per-user daily quota per feature, plus a global daily backstop, counted
 * in Redis per Asia/Dhaka calendar day. A slot is claimed before the model
 * call (INCR, undone if over the limit) and given back only when no answer
 * came back. Redis down = fail closed (AI_UNAVAILABLE), never unmetered.
 */
@Injectable()
export class AiQuotaService {
  private readonly logger = new Logger(AiQuotaService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly settings: AiSettings,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  protected store(): QuotaStore {
    return this.redis.getClient();
  }

  async claim(userId: string, feature: AiFeature): Promise<QuotaTicket> {
    const limit = this.settings.dailyLimit(feature);
    const day = this.day();
    const userKey = `ai:quota:${feature}:${userId}:${day}`;
    const globalKey = `ai:quota:global:${day}`;
    const store = this.store();
    try {
      const used = await this.bump(store, userKey);
      if (used > limit) {
        await store.decr(userKey);
        throw aiErrors.quotaExceeded(limit, this.secondsToReset());
      }
      const total = await this.bump(store, globalKey);
      if (total > this.settings.globalDailyLimit) {
        await store.decr(globalKey);
        await store.decr(userKey);
        this.logger.warn({ msg: "ai global daily limit reached", day });
        throw aiErrors.unavailable();
      }
    } catch (error) {
      if (error instanceof KajHttpException) throw error;
      this.logger.error({ msg: "ai quota store failed", err: String(error) });
      throw aiErrors.unavailable();
    }
    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        await Promise.all([store.decr(userKey), store.decr(globalKey)]).catch(
          () => undefined,
        );
      },
    };
  }

  /** Today's use of each feature (null when Redis can't be read). */
  async usage(userId: string): Promise<Record<AiFeature, number | null>> {
    const day = this.day();
    const read = async (feature: AiFeature) => {
      try {
        const value = await this.store().get(
          `ai:quota:${feature}:${userId}:${day}`,
        );
        return Math.max(0, Number(value ?? 0));
      } catch {
        return null;
      }
    };
    const [idea, suggestions, tips] = await Promise.all([
      read(AiFeature.IDEA_ANALYSIS),
      read(AiFeature.OPPORTUNITY_SUGGESTIONS),
      read(AiFeature.BUSINESS_GROWTH_TIPS),
    ]);
    return {
      IDEA_ANALYSIS: idea,
      OPPORTUNITY_SUGGESTIONS: suggestions,
      BUSINESS_GROWTH_TIPS: tips,
    };
  }

  /** Calls counted against the global daily cap today (null: Redis unreadable). */
  async globalUsedToday(): Promise<number | null> {
    try {
      const value = await this.store().get(`ai:quota:global:${this.day()}`);
      return Math.max(0, Number(value ?? 0));
    } catch {
      return null;
    }
  }

  /** The next Asia/Dhaka midnight, when every quota resets. */
  resetsAt(): Date {
    const local = this.clock.now().getTime() + DHAKA_OFFSET_MS;
    const nextLocalMidnight = Math.floor(local / 86_400_000 + 1) * 86_400_000;
    return new Date(nextLocalMidnight - DHAKA_OFFSET_MS);
  }

  private secondsToReset(): number {
    return Math.max(
      1,
      Math.ceil(
        (this.resetsAt().getTime() - this.clock.now().getTime()) / 1000,
      ),
    );
  }

  private day(): string {
    return new Date(this.clock.now().getTime() + DHAKA_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
  }

  private async bump(store: QuotaStore, key: string): Promise<number> {
    const value = await store.incr(key);
    if (value === 1) await store.expire(key, KEY_TTL_SECONDS);
    return value;
  }
}

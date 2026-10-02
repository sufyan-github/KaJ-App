import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";

@Injectable()
export class ReadinessService {
  private pendingProbe: Promise<boolean> | undefined;
  private pendingResponse: Promise<boolean> | undefined;
  private cached: { expiresAt: number; ready: boolean } | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async isReady(): Promise<boolean> {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.ready;
    }
    if (this.pendingResponse) return this.pendingResponse;

    // Keep a single dependency probe in flight even if the response times out.
    // Public polling must not create an unbounded queue during an outage.
    this.pendingProbe ??= this.probe().finally(() => {
      this.pendingProbe = undefined;
    });
    this.pendingResponse = this.withDeadline(this.pendingProbe)
      .then((ready) => {
        this.cached = { expiresAt: Date.now() + 5_000, ready };
        return ready;
      })
      .finally(() => {
        this.pendingResponse = undefined;
      });
    return this.pendingResponse;
  }

  private async probe(): Promise<boolean> {
    const results = await Promise.allSettled([
      Promise.resolve().then(() => this.prisma.$queryRaw`SELECT 1`),
      Promise.resolve().then(() => this.redis.getClient().ping()),
    ]);
    return (
      results[0].status === "fulfilled" &&
      results[1].status === "fulfilled" &&
      results[1].value === "PONG"
    );
  }

  private async withDeadline(probe: Promise<boolean>): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        probe,
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 3_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

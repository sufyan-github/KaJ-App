import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  getClient(): Redis {
    this.client ??= new Redis(this.config.getOrThrow<string>("REDIS_URL"), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 5_000,
    });
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client || this.client.status === "end") return;
    try {
      await this.client.quit();
    } catch {
      // Shutdown must still complete when the cache is unreachable.
    } finally {
      this.client.disconnect();
    }
  }
}

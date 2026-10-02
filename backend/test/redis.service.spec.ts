import "reflect-metadata";

import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

import { RedisService } from "../src/infra/redis/redis.service";

jest.mock("ioredis");

describe("bounded Redis requests", () => {
  const quit = jest.fn();
  const disconnect = jest.fn();
  let service: RedisService;

  beforeEach(() => {
    quit.mockReset().mockResolvedValue("OK");
    disconnect.mockReset();
    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(
      () =>
        ({
          status: "ready",
          quit,
          disconnect,
        }) as unknown as Redis,
    );
    service = new RedisService(
      new ConfigService({ REDIS_URL: "redis://localhost:6379" }),
    );
  });

  it("bounds connection, command waits, and retries and reuses one client", () => {
    expect(service.getClient()).toBe(service.getClient());
    expect(Redis).toHaveBeenCalledTimes(1);
    expect(Redis).toHaveBeenCalledWith("redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 5_000,
    });
  });

  it("does not open a connection just to shut down", async () => {
    await service.onModuleDestroy();
    expect(Redis).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "disconnects even if quit fails: %s",
    async (fails) => {
      service.getClient();
      if (fails) quit.mockRejectedValueOnce(new Error("cache unavailable"));
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      expect(disconnect).toHaveBeenCalledTimes(1);
    },
  );
});

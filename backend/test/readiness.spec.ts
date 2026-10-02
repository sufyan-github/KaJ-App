import "reflect-metadata";

import { ReadinessService } from "../src/modules/health/readiness.service";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { RedisService } from "../src/infra/redis/redis.service";

describe("production readiness", () => {
  const query = jest.fn();
  const ping = jest.fn();
  let service: ReadinessService;

  beforeEach(() => {
    jest.useFakeTimers();
    query.mockReset().mockResolvedValue([{ "?column?": 1 }]);
    ping.mockReset().mockResolvedValue("PONG");
    service = new ReadinessService(
      { $queryRaw: query } as unknown as PrismaService,
      { getClient: () => ({ ping }) } as unknown as RedisService,
    );
  });
  afterEach(() => jest.useRealTimers());

  it("checks both dependencies and coalesces concurrent probes", async () => {
    expect(await Promise.all([service.isReady(), service.isReady()])).toEqual([
      true,
      true,
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(await service.isReady()).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5_001);
    expect(await service.isReady()).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(["database", "redis"])(
    "fails closed when %s is unavailable and recovers",
    async (dependency) => {
      const check = dependency === "database" ? query : ping;
      check.mockRejectedValueOnce(new Error("private-connection-details"));
      expect(await service.isReady()).toBe(false);
      await jest.advanceTimersByTimeAsync(5_001);
      expect(await service.isReady()).toBe(true);
    },
  );

  it("times out without starting another database query while one is stuck", async () => {
    let finish!: (value: unknown) => void;
    query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.isReady();
    await jest.advanceTimersByTimeAsync(3_000);
    expect(await first).toBe(false);
    await jest.advanceTimersByTimeAsync(5_001);
    const second = service.isReady();
    await jest.advanceTimersByTimeAsync(3_000);
    expect(await second).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    finish([]);
    await jest.advanceTimersByTimeAsync(5_001);
    expect(await service.isReady()).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects an unexpected Redis response", async () => {
    ping.mockResolvedValue("not-ready");
    expect(await service.isReady()).toBe(false);
  });
});

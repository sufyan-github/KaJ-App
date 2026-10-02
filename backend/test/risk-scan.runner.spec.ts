import { RiskScanRunner } from "../src/modules/risk/risk-scan.runner";
import { RiskService } from "../src/modules/risk/risk.service";

describe("RiskScanRunner", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("runs at startup and daily under a non-moderating system identity", async () => {
    const scan = jest.fn().mockResolvedValue({ automaticActions: 0 });
    const runner = new RiskScanRunner({ scan } as unknown as RiskService);
    runner.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(scan).toHaveBeenCalledWith(
      "Scheduled daily deterministic risk scan for human review.",
      null,
      { ip: null, ua: "system:risk-scan-runner" },
    );
    await jest.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(scan).toHaveBeenCalledTimes(2);
    await runner.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("does not overlap scans and drains the active scan before shutdown", async () => {
    let finish!: () => void;
    const scan = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const runner = new RiskScanRunner({ scan } as unknown as RiskService);
    runner.onModuleInit();
    await jest.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(scan).toHaveBeenCalledTimes(1);
    let stopped = false;
    const shutdown = runner.onModuleDestroy().then(() => {
      stopped = true;
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    finish();
    await shutdown;
    expect(stopped).toBe(true);
    await jest.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(scan).toHaveBeenCalledTimes(1);
  });
});

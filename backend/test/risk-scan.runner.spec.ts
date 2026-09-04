import { RiskScanRunner } from "../src/modules/risk/risk-scan.runner";
import { RiskService } from "../src/modules/risk/risk.service";

describe("RiskScanRunner", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("runs at startup and daily under a non-moderating system identity", () => {
    const scan = jest.fn().mockResolvedValue({ automaticActions: 0 });
    const runner = new RiskScanRunner({ scan } as unknown as RiskService);
    runner.onModuleInit();
    expect(scan).toHaveBeenCalledWith(
      "Scheduled daily deterministic risk scan for human review.",
      null,
      { ip: null, ua: "system:risk-scan-runner" },
    );
    jest.advanceTimersByTime(24 * 60 * 60_000);
    expect(scan).toHaveBeenCalledTimes(2);
    runner.onModuleDestroy();
    jest.advanceTimersByTime(24 * 60 * 60_000);
    expect(scan).toHaveBeenCalledTimes(2);
  });
});

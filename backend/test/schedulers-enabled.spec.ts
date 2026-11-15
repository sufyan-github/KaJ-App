import { schedulersEnabled } from "../src/common/scheduling/schedulers-enabled";
import { AssignmentLifecycleRunner } from "../src/modules/jobs/assignment-lifecycle.runner";
import { JobsService } from "../src/modules/jobs/jobs.service";

describe("background runner switch", () => {
  it("is on by default and off only for an explicit false", () => {
    expect(schedulersEnabled({})).toBe(true);
    expect(schedulersEnabled({ RUN_SCHEDULERS: "true" })).toBe(true);
    expect(schedulersEnabled({ RUN_SCHEDULERS: " FALSE " })).toBe(false);
  });

  it("does not start a runner when schedulers are disabled", () => {
    const previous = process.env.RUN_SCHEDULERS;
    process.env.RUN_SCHEDULERS = "false";
    try {
      const reconcile = jest.fn().mockResolvedValue(undefined);
      const runner = new AssignmentLifecycleRunner({
        reconcileDueAssignments: reconcile,
      } as unknown as JobsService);
      runner.onModuleInit();
      runner.onModuleDestroy();
      expect(reconcile).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.RUN_SCHEDULERS;
      else process.env.RUN_SCHEDULERS = previous;
    }
  });
});

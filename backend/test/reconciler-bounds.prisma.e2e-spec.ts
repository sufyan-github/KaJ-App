import { AssignmentStatus, JobStatus, RoleMode } from "@prisma/client";

import { JobsService } from "../src/modules/jobs/jobs.service";
import { HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R2 / DB-4: the minute reconciler reads only paid work that is due, in
 * bounded batches, with an index; reading assignments no longer runs it.
 */
databaseDescribe("assignment reconciler bounds (PostgreSQL)", () => {
  let api: HttpHarness;
  let jobs: JobsService;

  beforeAll(async () => {
    api = await HttpHarness.start();
    jobs = api.app.get(JobsService);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await api?.close();
  });

  it("still moves a confirmed job that starts within a day to UPCOMING", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER]);
    const worker = await api.actor([RoleMode.WORKER]);
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null },
    });
    const soon = new Date(Date.now() + 3 * 3_600_000);
    const job = await api.db.job.create({
      data: {
        poster_user_id: poster.id,
        title: "Reconciler job",
        description: "A job used only by the DB-4 test.",
        category_id: category.id,
        location_id: (
          await api.db.location.findFirstOrThrow({ where: { is_active: true } })
        ).id,
        job_type: "ONE_TIME",
        payment_model: "FIXED",
        status: JobStatus.CONFIRMED,
        starts_at: soon,
        ends_at: new Date(soon.getTime() + 3_600_000),
        workers_filled: 1,
      },
    });
    const application = await api.db.application.create({
      data: { job_id: job.id, worker_user_id: worker.id, status: "ACCEPTED" },
    });
    await api.db.assignment.create({
      data: {
        job_id: job.id,
        application_id: application.id,
        worker_user_id: worker.id,
        status: AssignmentStatus.CONFIRMED,
        agreed_price_poisha: 10000n,
        agreed_starts_at: soon,
        agreed_ends_at: new Date(soon.getTime() + 3_600_000),
      },
    });
    await jobs.reconcileDueAssignments();
    expect(
      (await api.db.job.findUniqueOrThrow({ where: { id: job.id } })).status,
    ).toBe(JobStatus.UPCOMING);
  });

  it("reads only due paid work, in a bounded batch", async () => {
    const spy = jest.spyOn(api.db.assignment, "findMany");
    await jobs.reconcileDueAssignments();
    const confirmed = spy.mock.calls
      .map(([args]) => args)
      .find(
        (args) =>
          (args?.where as { status?: unknown } | undefined)?.status ===
          AssignmentStatus.CONFIRMED,
      );
    spy.mockRestore();
    expect(confirmed).toBeDefined();
    expect(confirmed!.take).toBeGreaterThan(0);
    expect(JSON.stringify(confirmed!.where)).toContain(
      '"opportunity_type":"WORK"',
    );
  });

  it("has an index for it", async () => {
    const rows = await api.db.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'assignments'
        AND indexdef LIKE '%(status, agreed_starts_at)%'`;
    expect(rows.length).toBe(1);
  });

  it("does not run the global reconciliation when someone reads assignments", async () => {
    const reader = await api.actor([RoleMode.WORKER]);
    const spy = jest.spyOn(jobs, "reconcileDueAssignments");
    await api.get("assignments", reader).expect(200);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

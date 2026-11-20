import { JobStatus, RoleMode } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** N7: GET /assignments/:id says whether "Open dispute" will be accepted. */
databaseDescribe("dispute eligibility on the assignment (real HTTP)", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;
  const dispute = {
    reasonCode: "NOT_COMPLETED",
    description: "The work was not finished as agreed in the chat.",
  };

  beforeAll(async () => {
    api = await HttpHarness.start();
    poster = await api.actor([RoleMode.CUSTOMER]);
    worker = await api.actor([RoleMode.WORKER]);
  });

  afterAll(async () => {
    await api?.close();
  });

  const detail = async (assignmentId: string, as: Actor) =>
    (await api.get(`assignments/${assignmentId}`, as).expect(200)).body.data;

  it("offers a dispute after completion and cash, and agrees with POST", async () => {
    const { assignmentId } = await api.completedAssignment(poster, worker);
    await api
      .post(`assignments/${assignmentId}/payment/cash-paid`, poster)
      .expect(201);
    const before = await detail(assignmentId, worker);
    expect(before).toMatchObject({
      canDispute: true,
      disputeUnavailableReason: null,
      dispute: null,
    });
    expect(Date.parse(before.disputeWindowEndsAt)).toBeGreaterThan(Date.now());

    const opened = await api
      .post(`assignments/${assignmentId}/disputes`, worker, dispute)
      .expect(201);
    const after = await detail(assignmentId, poster);
    expect(after).toMatchObject({
      canDispute: false,
      disputeUnavailableReason: "DISPUTE_EXISTS",
      dispute: { id: opened.body.data.id },
    });
    const again = await api
      .post(`assignments/${assignmentId}/disputes`, poster, dispute)
      .expect(409);
    // R3 W15: the same answer as the assignment shows.
    expect(again.body.error.code).toBe("DISPUTE_EXISTS");
  });

  it("hides it once the job is reviewed, and POST gives the same answer", async () => {
    const { assignmentId, jobId } = await api.completedAssignment(
      poster,
      worker,
    );
    await api.db.job.update({
      where: { id: jobId },
      data: { status: JobStatus.REVIEWED },
    });
    expect(await detail(assignmentId, worker)).toMatchObject({
      canDispute: false,
      disputeWindowEndsAt: null,
      disputeUnavailableReason: "DISPUTE_NOT_ELIGIBLE",
    });
    const refused = await api
      .post(`assignments/${assignmentId}/disputes`, worker, dispute)
      .expect(409);
    expect(refused.body.error).toMatchObject({
      code: "DISPUTE_NOT_ELIGIBLE",
      message: "This assignment is not eligible for dispute.",
      messageKey: "error.dispute.not_eligible",
    });
  });

  it("hides it after the seven-day window", async () => {
    const { assignmentId, jobId } = await api.completedAssignment(
      poster,
      worker,
    );
    await api.db.job.update({
      where: { id: jobId },
      data: { completed_at: new Date(Date.now() - 8 * 86_400_000) },
    });
    expect(await detail(assignmentId, poster)).toMatchObject({
      canDispute: false,
      disputeUnavailableReason: "DISPUTE_WINDOW_CLOSED",
    });
    const refused = await api
      .post(`assignments/${assignmentId}/disputes`, poster, dispute)
      .expect(409);
    expect(refused.body.error.code).toBe("DISPUTE_WINDOW_CLOSED");
  });
});

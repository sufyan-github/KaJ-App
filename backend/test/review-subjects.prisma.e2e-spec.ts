import { randomUUID } from "node:crypto";
import { RoleMode } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P1.0: reviews are about a subject; assignment reviews are one kind. */
databaseDescribe("reviews on a subject (real HTTP)", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;
  let assignmentId: string;
  let jobId: string;

  beforeAll(async () => {
    api = await HttpHarness.start();
    poster = await api.actor([RoleMode.CUSTOMER]);
    worker = await api.actor([RoleMode.WORKER]);
    ({ assignmentId, jobId } = await api.completedAssignment(poster, worker));
  });

  afterAll(async () => {
    await api?.close();
  });

  it("reviews an assignment through the generic route, stored with its subject", async () => {
    await api
      .post("reviews", poster, {
        subjectType: "ASSIGNMENT",
        subjectId: assignmentId,
        rating: 5,
        comment: "Great work.",
      })
      .expect(201);
    const stored = await api.db.review.findFirstOrThrow({
      where: { reviewer_user_id: poster.id },
    });
    expect(stored).toMatchObject({
      subject_type: "ASSIGNMENT",
      subject_id: assignmentId,
      assignment_id: assignmentId,
      job_id: jobId,
    });
    // The old route sees the same review, and a second one is refused.
    await api
      .post(`assignments/${assignmentId}/reviews`, poster, { rating: 4 })
      .expect(409);
    const view = await api
      .get(
        `reviews/subject?subjectType=ASSIGNMENT&subjectId=${assignmentId}`,
        poster,
      )
      .expect(200);
    expect(view.body.data).toMatchObject({
      subjectType: "ASSIGNMENT",
      subjectId: assignmentId,
      myReview: {
        rating: 5,
        subjectType: "ASSIGNMENT",
        subjectId: assignmentId,
      },
    });
  });

  it("validates the subject", async () => {
    await api
      .post("reviews", poster, {
        subjectType: "PLANET",
        subjectId: assignmentId,
        rating: 5,
      })
      .expect(400);
    await api
      .post("reviews", worker, {
        subjectType: "ASSIGNMENT",
        subjectId: randomUUID(),
        rating: 5,
      })
      .expect(404);
  });

  it("keeps an assignment review tied to its assignment in the database", async () => {
    const review = await api.db.review.findFirstOrThrow({
      where: { reviewer_user_id: poster.id },
    });
    await expect(
      api.db.review.update({
        where: { id: review.id },
        data: { subject_id: randomUUID() },
      }),
    ).rejects.toThrow(/reviews_assignment_subject_check/);
  });
});

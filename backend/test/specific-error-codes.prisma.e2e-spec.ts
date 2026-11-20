import { randomUUID } from "node:crypto";
import { RoleMode, TrustLevel } from "@prisma/client";

import { DisputesService } from "../src/modules/disputes/disputes.service";
import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R3 / W15: refusals the app can act on. Identity is asked for with
 * IDENTITY_REQUIRED (and a "verify" action), a client booking an
 * unverified worker hears WORKER_NOT_VERIFIED, a second dispute says
 * DISPUTE_EXISTS, and business verification names the missing field.
 */
databaseDescribe("specific error codes (real HTTP)", () => {
  let api: HttpHarness;
  let categoryId: string;
  let skillId: string;
  let locationId: string;
  const slot = futureSlot(17);

  const publishedJob = async (poster: Actor) => {
    const id = (
      await api
        .post("jobs", poster, {
          title: `Error code job ${randomUUID().slice(0, 6)}`,
          description: "A job used only by the W15 test.",
          categoryId,
          skillIds: [skillId],
          locationId,
          jobType: "ONE_TIME",
          paymentModel: "FIXED",
          budgetMinPoisha: "10000",
          budgetMaxPoisha: "20000",
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
        })
        .expect(201)
    ).body.data.id as string;
    await api.post(`jobs/${id}/publish`, poster).expect(201);
    return id;
  };

  beforeAll(async () => {
    api = await HttpHarness.start();
    categoryId = (
      await api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      })
    ).id;
    skillId = (
      await api.db.skill.findFirstOrThrow({
        where: { category_id: categoryId, is_active: true },
      })
    ).id;
    locationId = (
      await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("asks an unverified worker to verify, with an action", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER]);
    const jobId = await publishedJob(poster);
    const worker = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.PHONE,
    });
    const refused = await api
      .post(`jobs/${jobId}/applications`, worker, {
        proposedStartsAt: slot.startsAt.toISOString(),
        proposedEndsAt: slot.endsAt.toISOString(),
      })
      .expect(409);
    expect(refused.body.error).toMatchObject({
      code: "IDENTITY_REQUIRED",
      messageKey: "error.jobs.identity_required",
      action: { type: "VERIFY_IDENTITY" },
    });
  });

  it("tells a client the worker is not verified yet", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER]);
    const worker = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.PHONE,
    });
    const refused = await api
      .post(`workers/${worker.id}/booking-requests`, poster, {
        title: "Fix the tap",
        description: "A booking used only by the W15 test.",
        categoryId,
        locationId,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        offeredPricePoisha: "15000",
      })
      .expect(409);
    expect(refused.body.error.code).toBe("WORKER_NOT_VERIFIED");
    expect(refused.body.error.message).not.toContain("before applying");
  });

  it("answers DISPUTE_EXISTS to a second dispute", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER]);
    const worker = await api.actor([RoleMode.WORKER]);
    const job = await api.db.job.create({
      data: {
        poster_user_id: poster.id,
        title: "Disputed job",
        description: "A job used only by the W15 test.",
        category_id: categoryId,
        location_id: locationId,
        job_type: "ONE_TIME",
        payment_model: "FIXED",
        status: "DISPUTED",
        completed_at: new Date(),
      },
    });
    const application = await api.db.application.create({
      data: { job_id: job.id, worker_user_id: worker.id, status: "ACCEPTED" },
    });
    const assignment = await api.db.assignment.create({
      data: {
        job_id: job.id,
        application_id: application.id,
        worker_user_id: worker.id,
        status: "CONFIRMED",
        agreed_price_poisha: 10000n,
        submitted_at: new Date(),
      },
    });
    await api.db.dispute.create({
      data: {
        job_id: job.id,
        assignment_id: assignment.id,
        opened_by_user_id: poster.id,
        reason_code: "NO_SHOW",
        description: "The first dispute.",
        evidence_due_at: new Date(Date.now() + 86_400_000),
        resolution_due_at: new Date(Date.now() + 3 * 86_400_000),
      },
    });
    await expect(
      api.app.get(DisputesService).open(worker.id, assignment.id, {
        reasonCode: "PAYMENT_NOT_RECEIVED",
        description: "A second dispute on the same job.",
      } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "DISPUTE_EXISTS" }),
    });
  });

  it("names the missing field when a business can't be verified", async () => {
    const owner = await api.actor([RoleMode.BUSINESS]);
    const sector = await api.db.businessCategory.findUniqueOrThrow({
      where: { slug: "food" },
    });
    const id = (
      await api
        .post("businesses", owner, {
          name: "Unlicensed kitchen",
          categoryId: sector.id,
          locationId,
          stage: "REGISTERED",
        })
        .expect(201)
    ).body.data.id;
    const document = await api.db.document.create({
      data: {
        user_id: owner.id,
        kind: "BUSINESS_DOCUMENT",
        storage_key: `private/documents/${owner.id}/${randomUUID()}.pdf`,
        mime: "application/pdf",
        size_bytes: 2000,
      },
    });
    const refused = await api
      .post(`businesses/${id}/verification`, owner, {
        documentIds: [document.id],
      })
      .expect(409);
    expect(refused.body.error).toMatchObject({
      code: "BUSINESS_NOT_REGISTERED",
      field: "tradeLicenceNo",
    });
  });
});

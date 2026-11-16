import { randomUUID } from "node:crypto";
import { AdminRole, MentorStatus, RoleMode } from "@prisma/client";
import request from "supertest";

import { LearningAdminService } from "../src/modules/learning/learning-admin.service";
import { workerSelect } from "../src/modules/matching/matching.service";
import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P1.4 / Journey B: learn with a mentor → verifiable completion record. */
databaseDescribe("completion records (real HTTP)", () => {
  let api: HttpHarness;
  let mentor: Actor;
  let learner: Actor;
  let skillId: string;
  let enrolmentId: string;
  let code: string;
  const slot = futureSlot(14);

  beforeAll(async () => {
    api = await HttpHarness.start();
    mentor = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER], {
      displayName: "Karim Mia",
    });
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    await api.db.user.update({
      where: { id: mentor.id },
      data: { role_modes: [RoleMode.CUSTOMER, RoleMode.MENTOR] },
    });
    learner = await api.actor([RoleMode.WORKER], { displayName: "Rina Das" });
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null },
    });
    skillId = (
      await api.db.skill.create({
        data: {
          slug: `practical-${randomUUID()}`,
          category_id: category.id,
          name_en: "Tailoring",
          name_bn: "দর্জির কাজ",
        },
      })
    ).id;
    const location = await api.db.location.findFirstOrThrow({
      where: { is_active: true },
    });
    const opportunityId = (
      await api
        .post("learning-opportunities", mentor, {
          opportunityType: "TRAINING",
          title: "Blouse tailoring course",
          description: "Learn to cut and stitch a blouse from start to finish.",
          categoryId: category.id,
          skillIds: [skillId],
          locationId: location.id,
          participantTerms: "FREE",
          seats: 2,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
        })
        .expect(201)
    ).body.data.id;
    await api
      .post(`learning-opportunities/${opportunityId}/publish`, mentor)
      .expect(201);
    const applicationId = (
      await api
        .post(`learning-opportunities/${opportunityId}/applications`, learner)
        .expect(201)
    ).body.data.id;
    enrolmentId = (
      await api
        .post(`learning-applications/${applicationId}/accept`, mentor)
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("needs a session the learner confirmed before completion", async () => {
    const recorded = await api
      .post(`learning-enrolments/${enrolmentId}/sessions`, mentor, {
        heldAt: new Date(Date.now() - 86_400_000).toISOString(),
        minutes: 120,
        topic: "Cutting and stitching",
      })
      .expect(201);
    const early = await api
      .post(`learning-enrolments/${enrolmentId}/complete`, mentor)
      .expect(409);
    expect(early.body.error.code).toBe("NO_CONFIRMED_SESSIONS");
    await api
      .post(
        `learning-sessions/${recorded.body.data.sessions[0].id}/confirm`,
        learner,
      )
      .expect(201);
    // The learner can't complete their own enrolment.
    await api
      .post(`learning-enrolments/${enrolmentId}/complete`, learner)
      .expect(403);
  });

  it("issues a practical record the learner holds and anyone can verify", async () => {
    const completed = await api
      .post(`learning-enrolments/${enrolmentId}/complete`, mentor)
      .expect(201);
    expect(completed.body.data).toMatchObject({
      status: "COMPLETED",
      completionRecord: {
        evidenceLevel: "PRACTICAL_CHECKED",
        status: "VALID",
      },
    });
    code = completed.body.data.completionRecord.code;
    // Completing twice returns the same record.
    const again = await api
      .post(`learning-enrolments/${enrolmentId}/complete`, mentor)
      .expect(201);
    expect(again.body.data.completionRecord.code).toBe(code);

    const mine = await api.get("me/certificates", learner).expect(200);
    expect(mine.body.data.items).toEqual([
      expect.objectContaining({
        kind: "PRACTICAL",
        code,
        title: "Blouse tailoring course",
        skill: expect.objectContaining({ id: skillId, nameBn: "দর্জির কাজ" }),
        issuedBy: { userId: mentor.id, displayName: "Karim M." },
        status: "VALID",
      }),
    ]);

    const verify = await request(api.app.getHttpServer())
      .get(`/api/v1/certificates/${code}`)
      .expect(200);
    expect(verify.body.data).toMatchObject({
      code,
      kind: "PRACTICAL",
      holderName: "Rina D.",
      issuedByName: "Karim M.",
      courseTitleEn: "Blouse tailoring course",
      evidenceLevel: "PRACTICAL_CHECKED",
      status: "VALID",
    });
    expect(JSON.stringify(verify.body)).not.toContain("+880");

    // It counts for matching on the opportunity's skill.
    const worker = await api.db.user.findUniqueOrThrow({
      where: { id: learner.id },
      select: workerSelect,
    });
    expect(worker.training_certificates).toEqual([
      expect.objectContaining({ skill_id: skillId }),
    ]);
  });

  it("lets an admin revoke it, audited, and verification says so", async () => {
    const admin = api.app.get(LearningAdminService);
    const listed = await admin.certificates({
      kind: "PRACTICAL",
      search: code,
    });
    expect(listed.items).toEqual([
      expect.objectContaining({ code, kind: "PRACTICAL", status: "VALID" }),
    ]);
    const adminUser = await api.actor([RoleMode.CUSTOMER]);
    await admin.revokeCertificate(
      listed.items[0]!.id,
      { reason: "Issued by mistake for the wrong learner." },
      {
        userId: adminUser.id,
        email: "learn-admin@kaj.test",
        role: AdminRole.ADMIN,
        sessionId: randomUUID(),
      },
      { ip: "127.0.0.1", ua: "completion-test" },
    );
    const verify = await request(api.app.getHttpServer())
      .get(`/api/v1/certificates/${code}`)
      .expect(200);
    expect(verify.body.data.status).toBe("REVOKED");
    expect(
      await api.db.auditLog.count({
        where: {
          actor_user_id: adminUser.id,
          action: "ADMIN_CERTIFICATE_REVOKED",
        },
      }),
    ).toBe(1);
    // The admin route itself needs an admin session.
    await request(api.app.getHttpServer())
      .post(`/api/v1/admin/certificates/${listed.items[0]!.id}/revoke`)
      .send({ reason: "No session, should fail." })
      .expect(401);
  });

  it("allows exactly one source per record in the database", async () => {
    await expect(
      api.db.trainingCertificate.create({
        data: {
          user_id: learner.id,
          evidence_level: "PRACTICAL_CHECKED",
          public_code: `TEST${randomUUID().slice(0, 6).toUpperCase()}`,
        },
      }),
    ).rejects.toThrow(/training_certificates_one_source_check/);
  });
});

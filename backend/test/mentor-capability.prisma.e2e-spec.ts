import { randomUUID } from "node:crypto";
import {
  AdminRole,
  RoleMode,
  TrustLevel,
  VerificationKind,
  VerificationStatus,
} from "@prisma/client";

import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { MentorsService } from "../src/modules/mentors/mentors.service";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P1.1: mentor application → admin approval → MENTOR capability. */
databaseDescribe("mentor capability (real HTTP)", () => {
  let api: HttpHarness;
  let ops: AdminOpsService;
  let admin: {
    userId: string;
    email: string;
    role: AdminRole;
    sessionId: string;
  };
  let skillId: string;
  const context = { ip: "127.0.0.1", ua: "mentor-test" };

  async function evidence(owner: Actor, count = 1) {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1)
      ids.push(
        (
          await api.db.document.create({
            data: {
              user_id: owner.id,
              kind: "VERIFICATION_DOCUMENT",
              storage_key: `private/documents/${owner.id}/${randomUUID()}.pdf`,
              mime: "application/pdf",
              size_bytes: 1000,
              is_sensitive: true,
            },
          })
        ).id,
      );
    return ids;
  }

  const application = async (owner: Actor) => ({
    skills: [{ skillId, level: "EXPERT" }],
    bio: "I have repaired phones for ten years and trained three apprentices.",
    yearsExperience: 10,
    documentIds: await evidence(owner),
  });

  const decide = (requestId: string, status: VerificationStatus) =>
    ops.decideVerification(
      requestId,
      { status, reason: "Mentor evidence reviewed by the test." },
      admin,
      context,
    );

  beforeAll(async () => {
    api = await HttpHarness.start();
    ops = api.app.get(AdminOpsService);
    const adminUser = await api.actor([RoleMode.CUSTOMER]);
    admin = {
      userId: adminUser.id,
      email: "mentor-admin@kaj.test",
      role: AdminRole.ADMIN,
      sessionId: randomUUID(),
    };
    skillId = (
      await api.db.skill.create({
        data: {
          slug: `mentor-test-${randomUUID()}`,
          category_id: (
            await api.db.category.findFirstOrThrow({
              where: { is_active: true },
            })
          ).id,
          name_en: "Phone repair",
          name_bn: "ফোন মেরামত",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("refuses a phone-only account and a direct MENTOR verification", async () => {
    const unverified = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.PHONE,
    });
    const refused = await api
      .post("me/mentor/application", unverified, await application(unverified))
      .expect(409);
    expect(refused.body.error.code).toBe("IDENTITY_REQUIRED");

    const verified = await api.actor([RoleMode.WORKER]);
    const direct = await api
      .post("verification-requests", verified, {
        kind: "MENTOR",
        documentIds: await evidence(verified),
      })
      .expect(400);
    expect(direct.body.error.code).toBe("USE_MENTOR_APPLICATION");
  });

  it("approves a mentor through the verification queue", async () => {
    const mentor = await api.actor([RoleMode.WORKER], {
      displayName: "Karim Mia",
    });
    // Can't switch to mentor mode before approval.
    const early = await api
      .post("me/roles/activate", mentor, { role: "MENTOR" })
      .expect(403);
    expect(early.body.error.code).toBe("MENTOR_APPROVAL_REQUIRED");

    const applied = await api
      .post("me/mentor/application", mentor, await application(mentor))
      .expect(201);
    expect(applied.body.data).toMatchObject({
      status: "PENDING",
      accepting: false,
      yearsExperience: 10,
      skills: [{ skillId, level: "EXPERT" }],
    });
    const again = await api
      .post("me/mentor/application", mentor, await application(mentor))
      .expect(409);
    expect(again.body.error.code).toBe("MENTOR_APPLICATION_PENDING");
    const notYet = await api
      .put("me/mentor", mentor, { accepting: true })
      .expect(403);
    expect(notYet.body.error.code).toBe("MENTOR_APPROVAL_REQUIRED");
    await expect(
      api.app.get(MentorsService).assertApproved(mentor.id),
    ).rejects.toThrow();

    // The admin queue shows what the applicant offers.
    const queue = await ops.verifications(
      { kind: VerificationKind.MENTOR, limit: 100 } as never,
      admin,
      context,
    );
    const item = queue.items.find((entry) => entry.user.id === mentor.id)!;
    expect(item.mentorApplication).toMatchObject({
      yearsExperience: 10,
      skills: [{ skillId, nameEn: "Phone repair" }],
    });

    const trustBefore = (
      await api.db.profile.findUniqueOrThrow({ where: { user_id: mentor.id } })
    ).trust_level;
    await decide(item.id, VerificationStatus.APPROVED);
    const user = await api.db.user.findUniqueOrThrow({
      where: { id: mentor.id },
      include: { profile: true },
    });
    expect(user.role_modes).toContain(RoleMode.MENTOR);
    expect(user.profile).toMatchObject({
      mentor_status: "APPROVED",
      mentor_accepting: true,
      // A mentor approval is not a step on the trust ladder.
      trust_level: trustBefore,
    });
    await expect(
      api.app.get(MentorsService).assertApproved(mentor.id),
    ).resolves.toBeUndefined();

    const activated = await api
      .post("me/roles/activate", mentor, { role: "MENTOR" })
      .expect(201);
    expect(activated.body.data).toMatchObject({
      activeRole: "MENTOR",
      home: "mentor",
    });

    // Listed for learners, with what they teach, until they pause.
    const learner = await api.actor([RoleMode.CUSTOMER]);
    const listed = await api
      .get(`mentors?skillId=${skillId}`, learner)
      .expect(200);
    expect(listed.body.data.items).toEqual([
      expect.objectContaining({
        id: mentor.id,
        displayName: "Karim M.",
        skills: [expect.objectContaining({ skillId, nameBn: "ফোন মেরামত" })],
      }),
    ]);
    // API-6: public profiles need a sign-in.
    const publicProfile = await api
      .get(`users/${mentor.id}/public`, learner)
      .expect(200);
    expect(publicProfile.body.data.mentor).toMatchObject({
      accepting: true,
      skillIds: [skillId],
    });
    await api.put("me/mentor", mentor, { accepting: false }).expect(200);
    expect(
      (await api.get(`mentors?skillId=${skillId}`, learner).expect(200)).body
        .data.items,
    ).toEqual([]);
  });

  it("accepts the app's shorthand (skillIds, accepting) and shows the mentor status on the profile", async () => {
    const applicant = await api.actor([RoleMode.WORKER]);
    const applied = await api
      .post("me/mentor/application", applicant, {
        skillIds: [skillId],
        bio: "I teach phone repair to young people in my neighbourhood.",
        yearsExperience: 6,
        accepting: true,
        documentIds: await evidence(applicant),
      })
      .expect(201);
    expect(applied.body.data).toMatchObject({
      status: "PENDING",
      rejectionReason: null,
      skills: [{ skillId, level: "ADVANCED" }],
    });
    const profile = await api.get("profiles/me", applicant).expect(200);
    expect(profile.body.data.mentorStatus).toBe("PENDING");
    const noSkills = await api.actor([RoleMode.WORKER]);
    const none = await api
      .post("me/mentor/application", noSkills, {
        bio: "No skills chosen in this application at all.",
        yearsExperience: 1,
        documentIds: await evidence(noSkills),
      })
      .expect(400);
    expect(none.body.error).toMatchObject({
      code: "VALIDATION_FAILED",
      field: "skills",
    });
  });

  it("withdraws the offered skills on rejection and allows a new application", async () => {
    const applicant = await api.actor([RoleMode.WORKER]);
    const applied = await api
      .post("me/mentor/application", applicant, await application(applicant))
      .expect(201);
    await decide(
      applied.body.data.verificationRequestId,
      VerificationStatus.REJECTED,
    );
    const after = await api.get("me/mentor", applicant).expect(200);
    expect(after.body.data).toMatchObject({
      status: "REJECTED",
      rejectionReason: "Mentor evidence reviewed by the test.",
      skills: [],
      application: { status: "REJECTED" },
    });
    const user = await api.db.user.findUniqueOrThrow({
      where: { id: applicant.id },
    });
    expect(user.role_modes).not.toContain(RoleMode.MENTOR);
    await api
      .post("me/mentor/application", applicant, await application(applicant))
      .expect(201);
  });
});

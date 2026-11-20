import "reflect-metadata";
import { randomUUID } from "node:crypto";

import {
  AdminRole,
  IdeaVisibility,
  MentorStatus,
  RoleMode,
} from "@prisma/client";

import { adminSession } from "./support/admin-session";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.TRUST_DATABASE_E2E === "1" ? describe : describe.skip;

const REASON = "Checked by the moderation team today.";

/** R5 admin lists: businesses, ideas, introductions, mentors, attendance. */
databaseDescribe("admin directory lists (real HTTP)", () => {
  let api: HttpHarness;
  let admin: Actor;
  let owner: Actor;
  let categoryId: string;
  const tag = randomUUID().slice(0, 8);

  beforeAll(async () => {
    api = await HttpHarness.start();
    admin = await adminSession(api, AdminRole.ADMIN);
    owner = await api.actor([RoleMode.CUSTOMER, RoleMode.BUSINESS]);
    categoryId = (await api.db.businessCategory.findFirstOrThrow()).id;
  });

  afterAll(async () => {
    await api.db.auditLog.deleteMany({ where: { actor_user_id: admin.id } });
    await api?.close();
  });

  it("lists businesses, finds them by name and filters hidden ones", async () => {
    const business = await api.db.businessProfile.create({
      data: { user_id: owner.id, business_name: `Directory shop ${tag}` },
    });
    const found = await api.get(`admin/businesses?search=${tag}`, admin);
    expect(found.status).toBe(200);
    expect(found.body.data.items).toEqual([
      expect.objectContaining({ id: business.id, hidden: false }),
    ]);
    expect(JSON.stringify(found.body.data)).not.toMatch(/\+880/u);

    const hide = await api.post(
      `admin/content/BUSINESS/${business.id}/hide`,
      admin,
      { reason: REASON },
    );
    expect(hide.status).toBe(201);
    const hidden = await api.get(
      `admin/businesses?search=${tag}&state=hidden`,
      admin,
    );
    expect(hidden.body.data.items.map((b: { id: string }) => b.id)).toEqual([
      business.id,
    ]);
    const visible = await api.get(
      `admin/businesses?search=${tag}&state=visible`,
      admin,
    );
    expect(visible.body.data.items).toEqual([]);
  });

  it("lists shared ideas but never private ones that were not hidden", async () => {
    const idea = (visibility: IdeaVisibility, title: string) =>
      api.db.businessIdea.create({
        data: {
          owner_user_id: owner.id,
          title: `${title} ${tag}`,
          summary: "A one-line summary.",
          problem: "Private problem text.",
          solution: "Private solution text.",
          category_id: categoryId,
          visibility,
        },
      });
    const shared = await idea(IdeaVisibility.SUMMARY_PUBLIC, "Shared idea");
    const secret = await idea(IdeaVisibility.PRIVATE, "Secret idea");
    const response = await api.get(`admin/ideas?search=${tag}`, admin);
    const ids = response.body.data.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(shared.id);
    expect(ids).not.toContain(secret.id);
    expect(JSON.stringify(response.body.data)).not.toContain(
      "Private problem text.",
    );
  });

  it("lists introductions without their message, with sender volume", async () => {
    for (let index = 0; index < 3; index += 1) {
      // One request per requester and expert, so three experts.
      const target = await api.actor([RoleMode.WORKER]);
      await api.db.profile.update({
        where: { user_id: target.id },
        data: { display_name: `Expert ${tag} ${index}` },
      });
      await api.db.introductionRequest.create({
        data: {
          requester_user_id: owner.id,
          target_user_id: target.id,
          context_type: "LEARNING_GOAL",
          context_summary: "Wants to learn tailoring.",
          message: "A private message to the expert.",
          expires_at: new Date(Date.now() + 7 * 86_400_000),
        },
      });
    }
    const response = await api.get(
      `admin/introductions?search=${tag}&limit=2`,
      admin,
    );
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.nextCursor).not.toBeNull();
    expect(response.body.data.items[0].requester.sentLast7Days).toBe(3);
    expect(JSON.stringify(response.body.data)).not.toContain(
      "A private message",
    );
    const next = await api.get(
      `admin/introductions?search=${tag}&limit=2&cursor=${response.body.data.nextCursor}`,
      admin,
    );
    expect(next.body.data.items).toHaveLength(1);
  });

  it("lists a mentor with no opportunity, who can be suspended from the list", async () => {
    const mentor = await api.actor([RoleMode.WORKER]);
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: {
        display_name: `Mentor ${tag}`,
        mentor_status: MentorStatus.APPROVED,
        mentor_approved_at: new Date(),
        mentor_applied_at: new Date(),
      },
    });
    const listed = await api.get(
      `admin/mentors?search=${tag}&status=APPROVED`,
      admin,
    );
    expect(listed.body.data.items).toEqual([
      expect.objectContaining({ userId: mentor.id, opportunities: 0 }),
    ]);
    const suspended = await api.post(
      `admin/mentors/${mentor.id}/suspend`,
      admin,
      { reason: REASON },
    );
    expect(suspended.status).toBe(201);
    const after = await api.get(
      `admin/mentors?search=${tag}&status=SUSPENDED`,
      admin,
    );
    expect(after.body.data.items).toHaveLength(1);
  });

  it("lists assignments that need a check-in, and the override clears it", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER]);
    const worker = await api.actor([RoleMode.WORKER]);
    const jobId = await api.openJob(poster, { title: `Attendance job ${tag}` });
    const applicationId = await api.apply(jobId, worker);
    const accepted = await api.post(
      `applications/${applicationId}/accept`,
      poster,
    );
    const assignmentId = accepted.body.data.id as string;
    expect(
      (await api.post(`assignments/${assignmentId}/confirm`, worker)).status,
    ).toBe(201);
    await api.db.assignment.update({
      where: { id: assignmentId },
      data: { agreed_starts_at: new Date(Date.now() - 600_000) },
    });

    const needs = await api.get(
      `admin/attendance?state=needs-checkin&search=${tag}`,
      admin,
    );
    expect(needs.status).toBe(200);
    expect(needs.body.data.items.map((a: { id: string }) => a.id)).toEqual([
      assignmentId,
    ]);

    const flag = await api.db.featureFlag.findUnique({
      where: { key: "checkin_enabled" },
      select: { is_enabled: true, rollout_percent: true },
    });
    await api.db.featureFlag.upsert({
      where: { key: "checkin_enabled" },
      update: { is_enabled: true, rollout_percent: 100 },
      create: {
        key: "checkin_enabled",
        is_enabled: true,
        rollout_percent: 100,
      },
    });
    const override = await Promise.resolve(
      api
        .post(`admin/assignments/${assignmentId}/checkin-override`, admin, {
          reason: "Worker phone has no GPS signal on site.",
        })
        .set("Idempotency-Key", randomUUID()),
    ).finally(() =>
      api.db.featureFlag.update({
        where: { key: "checkin_enabled" },
        data: flag ?? { is_enabled: false, rollout_percent: 0 },
      }),
    );
    expect([override.status, override.body?.error?.message]).toEqual([
      201,
      undefined,
    ]);
    const after = await api.get(
      `admin/attendance?state=needs-checkin&search=${tag}`,
      admin,
    );
    expect(after.body.data.items).toEqual([]);
    const all = await api.get(`admin/attendance?search=${tag}`, admin);
    expect(all.body.data.items[0]).toMatchObject({
      id: assignmentId,
      overrideReason: "Worker phone has no GPS signal on site.",
    });
    expect(all.body.data.items[0].checkinAt).not.toBeNull();
  });

  it("refuses unknown filters", async () => {
    const response = await api.get("admin/attendance?state=late", admin);
    expect(response.status).toBe(400);
  });
});

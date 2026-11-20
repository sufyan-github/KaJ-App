import { MentorStatus, RoleMode } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R2 / W5: an approved mentor who is not also a worker can set their own
 * availability (so they can offer consultation times) and has a public
 * profile, so the mentor directory does not dead-end.
 */
databaseDescribe("mentor-only accounts (real HTTP)", () => {
  let api: HttpHarness;
  let mentor: Actor;
  let learner: Actor;

  beforeAll(async () => {
    api = await HttpHarness.start();
    mentor = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER], {
      displayName: "Nasrin Akter",
    });
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: {
        mentor_status: MentorStatus.APPROVED,
        mentor_accepting: true,
        mentor_bio: "Twenty years of tailoring.",
      },
    });
    learner = await api.actor([RoleMode.CUSTOMER]);
  });

  afterAll(async () => {
    await api?.close();
  });

  it("lets the mentor set and read their availability", async () => {
    await api
      .put("profiles/me/availability", mentor, {
        rules: [{ dayOfWeek: 1, startTime: "10:00", endTime: "13:00" }],
      })
      .expect(200);
    const mine = await api.get("profiles/me/availability", mentor).expect(200);
    expect(JSON.stringify(mine.body.data)).toContain("10:00");
  });

  it("shows the mentor's public profile with what they teach", async () => {
    const profile = await api
      .get(`users/${mentor.id}/public`, learner)
      .expect(200);
    expect(profile.body.data).toMatchObject({
      id: mentor.id,
      displayName: "Nasrin A.",
      ratingCount: 0,
      mentor: expect.objectContaining({
        accepting: true,
        bio: "Twenty years of tailoring.",
      }),
    });
  });

  it("still hides someone who is neither a worker nor an approved mentor", async () => {
    const pending = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER]);
    await api.get(`users/${pending.id}/public`, learner).expect(404);
    await api
      .put("profiles/me/availability", learner, { rules: [] })
      .expect(403);
  });
});

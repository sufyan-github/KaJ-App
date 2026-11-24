import { MentorStatus, RoleMode } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R7 (mobile M6): a learner lists their own learning applications, newest
 * first, with the opportunity, the mentor (masked name) and the enrolment
 * once accepted. Work applications and other people's are not included.
 */
databaseDescribe("GET /me/learning-applications (real HTTP)", () => {
  let api: HttpHarness;
  let mentor: Actor;
  let categoryId: string;
  let locationId: string;

  const opportunity = async (title: string) => {
    const slot = futureSlot(14);
    const id = (
      await api
        .post("learning-opportunities", mentor, {
          opportunityType: "TRAINING",
          title,
          description: "A training used by the my-applications test.",
          categoryId,
          skillIds: [],
          locationId,
          participantTerms: "FREE",
          seats: 3,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          workArrangement: "ON_SITE",
        })
        .expect(201)
    ).body.data.id as string;
    await api.post(`learning-opportunities/${id}/publish`, mentor).expect(201);
    return id;
  };

  beforeAll(async () => {
    api = await HttpHarness.start();
    mentor = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER], {
      displayName: "Rahima Khatun",
    });
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    categoryId = (
      await api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      })
    ).id;
    locationId = (
      await api.db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("lists my learning applications with the opportunity and enrolment", async () => {
    const learner = await api.actor([RoleMode.WORKER]);
    const other = await api.actor([RoleMode.WORKER]);
    const first = await opportunity("Tailoring basics");
    const second = await opportunity("Bookkeeping basics");
    const accepted = (
      await api
        .post(`learning-opportunities/${first}/applications`, learner, {
          message: "I want to learn.",
        })
        .expect(201)
    ).body.data.id;
    const enrolmentId = (
      await api
        .post(`learning-applications/${accepted}/accept`, mentor)
        .expect(201)
    ).body.data.id;
    const pending = (
      await api
        .post(`learning-opportunities/${second}/applications`, learner)
        .expect(201)
    ).body.data.id;
    await api
      .post(`learning-opportunities/${second}/applications`, other)
      .expect(201);
    // A work application is not a learning one.
    const poster = await api.actor([RoleMode.CUSTOMER]);
    await api.apply(await api.openJob(poster), learner);

    const list = await api.get("me/learning-applications", learner).expect(200);
    const items = list.body.data.items;
    expect(items.map((item: { id: string }) => item.id)).toEqual([
      pending,
      accepted,
    ]);
    expect(items[0]).toMatchObject({
      status: "PENDING",
      enrolmentId: null,
      opportunity: { id: second, title: "Bookkeeping basics" },
      mentor: { userId: mentor.id, displayName: "Rahima K." },
    });
    expect(items[1]).toMatchObject({
      status: "ACCEPTED",
      message: "I want to learn.",
      enrolmentId,
      opportunity: {
        id: first,
        opportunityType: "TRAINING",
        status: expect.any(String),
      },
    });
    expect(items[1].appliedAt).toEqual(expect.any(String));
    expect(list.body.data.nextCursor).toBeNull();

    const paged = await api
      .get("me/learning-applications?limit=1", learner)
      .expect(200);
    expect(paged.body.data.items).toHaveLength(1);
    const rest = await api
      .get(
        `me/learning-applications?limit=1&cursor=${paged.body.data.nextCursor}`,
        learner,
      )
      .expect(200);
    expect(rest.body.data.items[0].id).toBe(accepted);
  });
});

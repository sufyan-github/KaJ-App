import { MentorStatus, RoleMode, TrustLevel } from "@prisma/client";
import { Response } from "supertest";

import { IntroductionsService } from "../src/modules/experts/introductions.service";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P3.1: consent-based introductions to experts. */
databaseDescribe("introduction requests (real HTTP)", () => {
  let api: HttpHarness;
  let requester: Actor;
  let expert: Actor;
  let outsider: Actor;
  let ideaId: string;
  let businessId: string;
  const phones = new Map<string, string>();

  const makeExpert = async (displayName: string, accepting = true) => {
    const actor = await api.actor([RoleMode.MENTOR, RoleMode.WORKER], {
      displayName,
    });
    await api.db.profile.update({
      where: { user_id: actor.id },
      data: {
        mentor_status: MentorStatus.APPROVED,
        mentor_accepting: accepting,
        mentor_bio: "Fifteen years in agro-processing and export.",
      },
    });
    return actor;
  };
  const ask = (as: Actor, expertUserId: string, extra: object = {}) =>
    api.post("introductions", as, {
      expertUserId,
      contextType: "IDEA",
      contextId: ideaId,
      message: "Could you advise on cold-chain costs for mangoes?",
      ...extra,
    });
  /** No phone number or email of anyone involved ever appears. */
  const noContacts = (response: Response) => {
    const text = JSON.stringify(response.body);
    for (const phone of phones.values()) expect(text).not.toContain(phone);
    expect(text).not.toMatch(/phone|email/i);
  };

  beforeAll(async () => {
    api = await HttpHarness.start();
    requester = await api.actor([RoleMode.CUSTOMER], {
      displayName: "Sabina Yasmin",
      trust: TrustLevel.IDENTITY,
    });
    expert = await makeExpert("Anwar Hossain");
    outsider = await api.actor([RoleMode.WORKER]);
    for (const actor of [requester, expert])
      phones.set(
        actor.id,
        (await api.db.user.findUniqueOrThrow({ where: { id: actor.id } }))
          .phone_e164!,
      );
    const sector = await api.db.businessCategory.findUniqueOrThrow({
      where: { slug: "agriculture" },
    });
    ideaId = (
      await api
        .post("ideas", requester, {
          title: "Mango cold room",
          summary: "A shared cold room so mango farmers sell later.",
          problem: "Secret problem statement for the cold room.",
          solution: "Secret solution for the cold room.",
          categoryId: sector.id,
        })
        .expect(201)
    ).body.data.id;
    businessId = (
      await api
        .post("businesses", requester, { name: "Sabina Agro" })
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  describe("who can be asked, with what", () => {
    it("asks an expert with an idea's public summary only, and no contact details", async () => {
      const created = await ask(requester, expert.id, {
        allowIdeaAccess: true,
      }).expect(201);
      expect(created.body.data).toMatchObject({
        status: "PENDING",
        role: "REQUESTER",
        expert: {
          userId: expert.id,
          displayName: "Anwar H.",
          bio: expect.any(String),
        },
        context: {
          type: "IDEA",
          id: ideaId,
          summary:
            "Mango cold room — A shared cold room so mango farmers sell later.",
        },
        allowIdeaAccess: true,
        ideaAccessGranted: false,
        conversationId: null,
        allowedActions: ["WITHDRAW"],
        expiresAt: expect.any(String),
      });
      noContacts(created);
      const days =
        (new Date(created.body.data.expiresAt).getTime() - Date.now()) /
        86_400_000;
      expect(days).toBeGreaterThan(6.9);

      // The expert sees the summary, not which idea, and not the details.
      const received = await api
        .get("introductions?box=received", expert)
        .expect(200);
      expect(received.body.data.items[0]).toMatchObject({
        role: "EXPERT",
        requester: { displayName: "Sabina Y." },
        context: {
          id: null,
          summary: expect.stringContaining("Mango cold room"),
        },
        allowedActions: ["ACCEPT", "DECLINE"],
      });
      expect(JSON.stringify(received.body)).not.toContain("Secret");
      noContacts(received);
      expect(
        await api.db.notification.count({
          where: { user_id: expert.id, type: "INTRODUCTION_REQUEST" },
        }),
      ).toBe(1);
      const sent = await api
        .get("introductions?box=sent", requester)
        .expect(200);
      expect(sent.body.data.items).toHaveLength(1);
    });

    it("allows one pending request per expert", async () => {
      const again = await ask(requester, expert.id).expect(409);
      expect(again.body.error.code).toBe("INTRODUCTION_ALREADY_PENDING");
    });

    it("only reaches approved mentors who take requests and can be found", async () => {
      const plain = await api.actor([RoleMode.WORKER]);
      await ask(requester, plain.id).expect(404);
      const paused = await makeExpert("Paused Expert", false);
      await ask(requester, paused.id).expect(404);
      const hidden = await makeExpert("Hidden Expert");
      await api
        .put("profiles/me/privacy", hidden, { discoverable: false })
        .expect(200);
      await ask(requester, hidden.id).expect(404);
      await ask(requester, requester.id).expect(404);
    });

    it("SECURITY: blocked people can't request introductions, either way", async () => {
      const blockedExpert = await makeExpert("Blocked Expert");
      await api.db.userBlock.create({
        data: {
          blocker_user_id: blockedExpert.id,
          blocked_user_id: requester.id,
        },
      });
      await ask(requester, blockedExpert.id).expect(404);
      const otherWay = await makeExpert("Other Way Expert");
      await api.db.userBlock.create({
        data: { blocker_user_id: requester.id, blocked_user_id: otherWay.id },
      });
      await ask(requester, otherWay.id).expect(404);
    });

    it("shares only your own context; idea access only from the owner", async () => {
      const second = await makeExpert("Second Expert");
      await ask(outsider, second.id).expect(404); // not their idea
      const offered = await api
        .post("introductions", requester, {
          expertUserId: second.id,
          contextType: "BUSINESS",
          contextId: businessId,
          message: "Advice on registering a small agro business, please.",
          allowIdeaAccess: true,
        })
        .expect(409);
      expect(offered.body.error.code).toBe("IDEA_ACCESS_OWNER_ONLY");
      const goal = await api
        .post("introductions", outsider, {
          expertUserId: second.id,
          contextType: "LEARNING_GOAL",
          learningGoal: "I want to learn bookkeeping for a small shop.",
          message: "Could you mentor me for a month?",
        })
        .expect(201);
      expect(goal.body.data.context).toMatchObject({
        type: "LEARNING_GOAL",
        id: null,
        summary: "I want to learn bookkeeping for a small shop.",
      });
      await api
        .post("introductions", outsider, {
          expertUserId: second.id,
          contextType: "LEARNING_GOAL",
          message: "Missing the goal itself here.",
        })
        .expect(400);
    });
  });

  describe("answers", () => {
    it("SECURITY: a stranger gets 404 on someone else's request", async () => {
      const id = (
        await api.get("introductions?box=sent", requester).expect(200)
      ).body.data.items[0].id;
      await api.get(`introductions/${id}`, outsider).expect(404);
      await api.post(`introductions/${id}/accept`, outsider).expect(404);
      await api.post(`introductions/${id}/withdraw`, outsider).expect(404);
      // The requester can't accept their own request.
      const wrong = await api
        .post(`introductions/${id}/accept`, requester)
        .expect(409);
      expect(wrong.body.error.code).toBe("INTRODUCTION_TRANSITION_NOT_ALLOWED");
    });

    it("accepts: a conversation opens and, with confidentiality accepted, idea access", async () => {
      const id = (
        await api.get("introductions?box=received", expert).expect(200)
      ).body.data.items[0].id;
      // Before acceptance the expert can't see the idea.
      await api.get(`ideas/${ideaId}`, expert).expect(404);
      const accepted = await api
        .post(`introductions/${id}/accept`, expert, {
          acceptConfidentiality: true,
        })
        .expect(201);
      expect(accepted.body.data).toMatchObject({
        status: "ACCEPTED",
        conversationId: expect.any(String),
        ideaAccessGranted: true,
        requester: { displayName: "Sabina Yasmin" },
        context: { id: ideaId },
      });
      noContacts(accepted);
      const idea = await api.get(`ideas/${ideaId}`, expert).expect(200);
      expect(idea.body.data).toMatchObject({
        myRelation: "ACCESS",
        details: { problem: "Secret problem statement for the cold room." },
      });
      const access = await api.db.ideaAccess.findUniqueOrThrow({
        where: { idea_id_user_id: { idea_id: ideaId, user_id: expert.id } },
      });
      expect(access.approved_by_user_id).toBe(requester.id);
      const participants = await api.db.conversationParticipant.findMany({
        where: { conversation_id: accepted.body.data.conversationId },
      });
      expect(participants.map((row) => row.user_id).sort()).toEqual(
        [requester.id, expert.id].sort(),
      );
      await api.post(`introductions/${id}/decline`, expert).expect(409);
    });

    it("gives no idea access unless the expert accepts the confidentiality notice", async () => {
      const third = await makeExpert("Third Expert");
      const id = (
        await ask(requester, third.id, { allowIdeaAccess: true }).expect(201)
      ).body.data.id;
      const accepted = await api
        .post(`introductions/${id}/accept`, third)
        .expect(201);
      expect(accepted.body.data.ideaAccessGranted).toBe(false);
      await api.get(`ideas/${ideaId}`, third).expect(404);
    });

    it("declines with a reason the requester sees, and withdraws", async () => {
      const fourth = await makeExpert("Fourth Expert");
      const id = (await ask(requester, fourth.id).expect(201)).body.data.id;
      await api
        .post(`introductions/${id}/decline`, fourth, {
          reason: "Fully booked this month.",
        })
        .expect(201);
      const seen = await api.get(`introductions/${id}`, requester).expect(200);
      expect(seen.body.data).toMatchObject({
        status: "DECLINED",
        declineReason: "Fully booked this month.",
      });
      expect(
        (await api.get(`introductions/${id}`, fourth).expect(200)).body.data
          .declineReason,
      ).toBeNull();
      // A closed request lets the requester ask again.
      const again = (await ask(requester, fourth.id).expect(201)).body.data.id;
      const withdrawn = await api
        .post(`introductions/${again}/withdraw`, requester)
        .expect(201);
      expect(withdrawn.body.data).toMatchObject({
        status: "WITHDRAWN",
        allowedActions: [],
      });
    });

    it("expires after 7 days without an answer", async () => {
      const fifth = await makeExpert("Fifth Expert");
      const asker = await api.actor([RoleMode.CUSTOMER]);
      const id = (
        await api
          .post("introductions", asker, {
            expertUserId: fifth.id,
            contextType: "LEARNING_GOAL",
            learningGoal: "Learn to price handmade crafts.",
            message: "Would you share how you price your work?",
          })
          .expect(201)
      ).body.data.id;
      await api.db.introductionRequest.update({
        where: { id },
        // Made 8 days ago, so it expired a day ago (an expiry can't come
        // before the request: R3 CHECK).
        data: {
          created_at: new Date(Date.now() - 8 * 86_400_000),
          expires_at: new Date(Date.now() - 1000),
        },
      });
      const result = await api.app.get(IntroductionsService).expireDue();
      expect(result.expired).toBeGreaterThanOrEqual(1);
      const seen = await api.get(`introductions/${id}`, asker).expect(200);
      expect(seen.body.data).toMatchObject({
        status: "EXPIRED",
        allowedActions: [],
      });
      await api.post(`introductions/${id}/accept`, fifth).expect(409);
      expect(
        await api.db.notification.count({
          where: { user_id: asker.id, type: "INTRODUCTION_EXPIRED" },
        }),
      ).toBe(1);
    });

    it("hides a request from both sides after a block", async () => {
      const sixth = await makeExpert("Sixth Expert");
      const asker = await api.actor([RoleMode.CUSTOMER]);
      const id = (
        await api
          .post("introductions", asker, {
            expertUserId: sixth.id,
            contextType: "LEARNING_GOAL",
            learningGoal: "Learn to repair sewing machines.",
            message: "Could you take me on for a few lessons?",
          })
          .expect(201)
      ).body.data.id;
      await api.db.userBlock.create({
        data: { blocker_user_id: sixth.id, blocked_user_id: asker.id },
      });
      await api.get(`introductions/${id}`, asker).expect(404);
      await api.get(`introductions/${id}`, sixth).expect(404);
    });
  });

  it("limits a person to 5 requests a day", async () => {
    const busy = await api.actor([RoleMode.CUSTOMER]);
    const body = (expertUserId: string) => ({
      expertUserId,
      contextType: "LEARNING_GOAL",
      learningGoal: "Learn basic accounting for a tailoring shop.",
      message: "Could you spare an hour to advise me?",
    });
    for (let index = 0; index < 5; index += 1)
      await api
        .post(
          "introductions",
          busy,
          body((await makeExpert(`Limit ${index}`)).id),
        )
        .expect(201);
    const limited = await api
      .post("introductions", busy, body((await makeExpert("Limit 5")).id))
      .expect(429);
    expect(limited.body.error.messageKey).toBe(
      "error.introduction.daily_limit",
    );
    expect(limited.headers["retry-after"]).toBeDefined();
  });

  it("can be reported by its participants only", async () => {
    const id = (
      await api.get("introductions?box=sent", requester).expect(200)
    ).body.data.items.find(
      (item: { status: string }) => item.status === "ACCEPTED",
    ).id;
    const report = {
      targetType: "INTRODUCTION",
      targetId: id,
      reasonCode: "HARASSMENT",
      description: "Pushy messages after the introduction.",
    };
    await api.post("reports", outsider, report).expect(404);
    await api.post("reports", requester, report).expect(201);
  });

  it("keeps parties and context consistent in the database", async () => {
    const base = {
      requester_user_id: requester.id,
      context_summary: "x",
      message: "x",
      expires_at: new Date(Date.now() + 86_400_000),
    };
    await expect(
      api.db.introductionRequest.create({
        data: {
          ...base,
          target_user_id: requester.id,
          context_type: "LEARNING_GOAL",
        },
      }),
    ).rejects.toThrow(/introduction_requests_parties_check/);
    await expect(
      api.db.introductionRequest.create({
        data: { ...base, target_user_id: outsider.id, context_type: "IDEA" },
      }),
    ).rejects.toThrow(/introduction_requests_context_check/);
  });
});

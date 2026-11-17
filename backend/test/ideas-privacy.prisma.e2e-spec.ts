import { RoleMode, TrustLevel } from "@prisma/client";
import { Response } from "supertest";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const PROBLEM = "Mango farmers in Chapai lose a third of the harvest to rot.";
const SOLUTION = "A solar cold room shared by ten farms, booked by SMS.";
const DETAILS = "Supplier quote: 4.2 lakh taka; site at Shibganj.";

/**
 * P2.7 privacy and security: the private details (problem, solution,
 * details) reach only the owner, the team and approved people; everyone
 * else gets 404 on every idea endpoint, and search shows summaries only.
 */
databaseDescribe("ideas: privacy and access (real HTTP)", () => {
  let api: HttpHarness;
  let owner: Actor;
  let outsider: Actor;
  let sectorId: string;
  let skillId: string;
  let privateId: string;
  let publicId: string;
  let privateRoleId: string;
  let publicRoleId: string;

  const idea = async (as: Actor, extra: object = {}) =>
    (
      await api
        .post("ideas", as, {
          title: "Shared cold room for mango farmers",
          summary:
            "A shared cold room so mango farmers sell later at better prices.",
          problem: PROBLEM,
          solution: SOLUTION,
          details: DETAILS,
          categoryId: sectorId,
          ...extra,
        })
        .expect(201)
    ).body.data.id as string;
  const leaks = (response: Response) => {
    const text = JSON.stringify(response.body);
    return [PROBLEM, SOLUTION, DETAILS].some((secret) => text.includes(secret));
  };

  /**
   * Every idea endpoint, as `as`; all must answer 404. Returns the
   * statuses, keyed by endpoint, for a readable failure.
   */
  async function everyEndpoint(as: Actor, ideaId: string, roleId: string) {
    const calls: Array<[string, () => Promise<Response>]> = [
      ["GET idea", () => api.get(`ideas/${ideaId}`, as)],
      [
        "PATCH idea",
        () => api.patch(`ideas/${ideaId}`, as, { title: "Mine now" }),
      ],
      ["DELETE idea", () => api.delete(`ideas/${ideaId}`, as)],
      ["GET roles", () => api.get(`ideas/${ideaId}/roles`, as)],
      [
        "POST role",
        () =>
          api.post(`ideas/${ideaId}/roles`, as, {
            roleType: "MARKETING",
            skillIds: [],
            timeCommitment: "PART_TIME",
          }),
      ],
      [
        "PATCH role",
        () =>
          api.patch(`ideas/${ideaId}/roles/${roleId}`, as, {
            status: "CLOSED",
          }),
      ],
      ["DELETE role", () => api.delete(`ideas/${ideaId}/roles/${roleId}`, as)],
      [
        "GET matches",
        () => api.get(`ideas/${ideaId}/roles/${roleId}/matches`, as),
      ],
      ["GET access list", () => api.get(`ideas/${ideaId}/access-requests`, as)],
      [
        "approve",
        () => api.post(`ideas/${ideaId}/access-requests/${as.id}/approve`, as),
      ],
      [
        "decline",
        () => api.post(`ideas/${ideaId}/access-requests/${as.id}/decline`, as),
      ],
      ["revoke", () => api.post(`ideas/${ideaId}/access/${as.id}/revoke`, as)],
      ["GET views", () => api.get(`ideas/${ideaId}/views`, as)],
      ["GET members", () => api.get(`ideas/${ideaId}/members`, as)],
      [
        "POST member",
        () =>
          api.post(`ideas/${ideaId}/members`, as, {
            collaborationRequestId: ideaId,
          }),
      ],
      [
        "DELETE member",
        () => api.delete(`ideas/${ideaId}/members/${owner.id}`, as),
      ],
      [
        "convert",
        () => api.post(`ideas/${ideaId}/convert`, as, { stage: "INFORMAL" }),
      ],
      [
        "collaboration request",
        () =>
          api.post("collaboration-requests", as, {
            subjectType: "IDEA",
            subjectId: ideaId,
            ideaRoleId: roleId,
            message: "I would like to help with marketing.",
          }),
      ],
      [
        "report idea",
        () =>
          api.post("reports", as, {
            targetType: "IDEA",
            targetId: ideaId,
            reasonCode: "SCAM",
            description: "Reporting to probe whether it exists.",
          }),
      ],
      [
        "report role",
        () =>
          api.post("reports", as, {
            targetType: "IDEA_ROLE",
            targetId: roleId,
            reasonCode: "SCAM",
            description: "Reporting to probe whether it exists.",
          }),
      ],
    ];
    const statuses: Record<string, number> = {};
    for (const [name, call] of calls) {
      const response = await call();
      statuses[name] = response.status;
      expect(leaks(response)).toBe(false);
    }
    return statuses;
  }
  const all404 = (statuses: Record<string, number>) =>
    Object.fromEntries(Object.keys(statuses).map((key) => [key, 404]));

  beforeAll(async () => {
    api = await HttpHarness.start();
    owner = await api.actor([RoleMode.CUSTOMER], {
      displayName: "Abdul Karim",
      trust: TrustLevel.IDENTITY,
    });
    outsider = await api.actor([RoleMode.WORKER]);
    sectorId = (
      await api.db.businessCategory.findUniqueOrThrow({
        where: { slug: "agriculture" },
      })
    ).id;
    skillId = (
      await api.db.skill.findFirstOrThrow({ where: { is_active: true } })
    ).id;
    privateId = await idea(owner);
    publicId = await idea(owner, { visibility: "SUMMARY_PUBLIC" });
    const role = (id: string) =>
      api
        .post(`ideas/${id}/roles`, owner, {
          roleType: "MARKETING",
          title: "Sell to Dhaka wholesalers",
          skillIds: [skillId],
          timeCommitment: "PART_TIME",
          arrangement: "EQUITY_TO_DISCUSS",
        })
        .expect(201);
    privateRoleId = (await role(privateId)).body.data.id;
    publicRoleId = (await role(publicId)).body.data.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("is private by default: the owner sees everything", async () => {
    const view = await api.get(`ideas/${privateId}`, owner).expect(200);
    expect(view.body.data).toMatchObject({
      visibility: "PRIVATE",
      myRelation: "OWNER",
      canViewDetails: true,
      details: { problem: PROBLEM, solution: SOLUTION, details: DETAILS },
      owner: { displayName: "Abdul Karim", identityVerified: true },
    });
  });

  it("SECURITY: a stranger gets 404 on every endpoint of a private idea", async () => {
    const statuses = await everyEndpoint(outsider, privateId, privateRoleId);
    expect(statuses).toEqual(all404(statuses));
    // Unchanged afterwards.
    const view = await api.get(`ideas/${privateId}`, owner).expect(200);
    expect(view.body.data.title).toBe("Shared cold room for mango farmers");
    expect(view.body.data.roles).toHaveLength(1);
  });

  it("SECURITY: a public idea shows only its summary; details stay 404-private", async () => {
    const card = await api.get(`ideas/${publicId}`, outsider).expect(200);
    expect(card.body.data).toMatchObject({
      id: publicId,
      summary: expect.any(String),
      myRelation: null,
      canViewDetails: false,
      myAccess: null,
      roles: [
        expect.objectContaining({ id: publicRoleId, roleType: "MARKETING" }),
      ],
      owner: { displayName: "Abdul K." },
    });
    expect(card.body.data.details).toBeUndefined();
    expect(leaks(card)).toBe(false);
    // Every owner/team endpoint stays 404.
    for (const path of [
      `ideas/${publicId}/access-requests`,
      `ideas/${publicId}/views`,
      `ideas/${publicId}/members`,
      `ideas/${publicId}/roles/${publicRoleId}/matches`,
    ])
      expect((await api.get(path, outsider)).status).toBe(404);
    await api.patch(`ideas/${publicId}`, outsider, { title: "x" }).expect(404);
    await api
      .post(`ideas/${publicId}/convert`, outsider, { stage: "INFORMAL" })
      .expect(404);
  });

  it("search returns public summaries only, never the private details", async () => {
    const found = await api.get("ideas?q=mango", outsider).expect(200);
    const ids = found.body.data.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(publicId);
    expect(ids).not.toContain(privateId);
    expect(leaks(found)).toBe(false);
    // Words only in the private details find nothing.
    const secret = await api.get("ideas?q=Shibganj", outsider).expect(200);
    expect(
      secret.body.data.items.map((item: { id: string }) => item.id),
    ).not.toContain(publicId);
    const byRole = await api
      .get("ideas?roleType=MARKETING", outsider)
      .expect(200);
    expect(
      byRole.body.data.items.map((item: { id: string }) => item.id),
    ).toContain(publicId);
    // The owner's own ideas aren't in their search.
    const own = await api.get("ideas?q=mango", owner).expect(200);
    expect(
      own.body.data.items.map((item: { id: string }) => item.id),
    ).not.toContain(publicId);
  });

  it("needs identity verification before an idea can be public", async () => {
    const phoneOnly = await api.actor([RoleMode.CUSTOMER], {
      trust: TrustLevel.PHONE,
    });
    const refused = await api
      .post("ideas", phoneOnly, {
        title: "Rickshaw battery swap",
        summary: "Swap stations for e-rickshaw batteries near bus stands.",
        problem: "Drivers wait hours to charge batteries.",
        solution: "Swap a charged battery in two minutes.",
        categoryId: sectorId,
        visibility: "SUMMARY_PUBLIC",
      })
      .expect(409);
    expect(refused.body.error).toMatchObject({
      code: "IDENTITY_REQUIRED",
      messageKey: "error.idea.identity_required",
    });
    const id = await idea(phoneOnly);
    await api
      .patch(`ideas/${id}`, phoneOnly, { visibility: "SUMMARY_PUBLIC" })
      .expect(409);
  });

  describe("access to the private details", () => {
    let viewer: Actor;

    beforeAll(async () => {
      viewer = await api.actor([RoleMode.CUSTOMER], {
        displayName: "Nusrat Jahan",
      });
    });

    it("asks with the confidentiality notice accepted", async () => {
      await api
        .post(`ideas/${publicId}/access-requests`, viewer, {
          acceptConfidentiality: false,
        })
        .expect(400);
      const asked = await api
        .post(`ideas/${publicId}/access-requests`, viewer, {
          acceptConfidentiality: true,
          message: "I run a cold-chain van service and could help.",
        })
        .expect(201);
      expect(asked.body.data).toMatchObject({
        status: "REQUESTED",
        notice: { key: "idea.notice.confidentiality" },
      });
      await api
        .post(`ideas/${publicId}/access-requests`, viewer, {
          acceptConfidentiality: true,
        })
        .expect(409);
      // Still only the card until approved.
      const card = await api.get(`ideas/${publicId}`, viewer).expect(200);
      expect(card.body.data).toMatchObject({
        canViewDetails: false,
        myAccess: { status: "REQUESTED" },
      });
      expect(leaks(card)).toBe(false);
      // A private idea can't be asked about.
      await api
        .post(`ideas/${privateId}/access-requests`, viewer, {
          acceptConfidentiality: true,
        })
        .expect(404);
    });

    it("shows the details after the owner approves (stamped), and logs every view", async () => {
      const list = await api
        .get(`ideas/${publicId}/access-requests`, owner)
        .expect(200);
      expect(list.body.data.items).toEqual([
        expect.objectContaining({
          userId: viewer.id,
          status: "REQUESTED",
          confidentialityAcceptedAt: expect.any(String),
        }),
      ]);
      await api
        .post(`ideas/${publicId}/access-requests/${viewer.id}/approve`, owner)
        .expect(201);
      const access = await api.db.ideaAccess.findUniqueOrThrow({
        where: { idea_id_user_id: { idea_id: publicId, user_id: viewer.id } },
      });
      expect(access).toMatchObject({
        status: "APPROVED",
        approved_by_user_id: owner.id,
      });

      const view = await api.get(`ideas/${publicId}`, viewer).expect(200);
      expect(view.body.data).toMatchObject({
        myRelation: "ACCESS",
        canViewDetails: true,
        details: { problem: PROBLEM, solution: SOLUTION },
        notice: { key: "idea.notice.confidentiality" },
      });
      await api.get(`ideas/${publicId}`, viewer).expect(200);
      const views = await api.get(`ideas/${publicId}/views`, owner).expect(200);
      expect(
        views.body.data.items.filter(
          (item: { viewerUserId: string }) => item.viewerUserId === viewer.id,
        ),
      ).toHaveLength(2);
      expect(views.body.data.items[0]).toMatchObject({ basis: "ACCESS" });
      // Approved access is not the team: owner endpoints stay 404.
      await api.get(`ideas/${publicId}/members`, viewer).expect(404);
      await api.get(`ideas/${publicId}/views`, viewer).expect(404);
      await api.patch(`ideas/${publicId}`, viewer, { title: "x" }).expect(404);
    });

    it("pauses access while the idea is MEMBERS-only, and hides it when PRIVATE", async () => {
      await api
        .patch(`ideas/${publicId}`, owner, { visibility: "MEMBERS" })
        .expect(200);
      expect((await api.get(`ideas/${publicId}`, viewer)).status).toBe(404);
      await api
        .patch(`ideas/${publicId}`, owner, { visibility: "PRIVATE" })
        .expect(200);
      // Approved access still works on a private idea.
      const view = await api.get(`ideas/${publicId}`, viewer).expect(200);
      expect(view.body.data.canViewDetails).toBe(true);
      expect((await api.get(`ideas/${publicId}`, outsider)).status).toBe(404);
      await api
        .patch(`ideas/${publicId}`, owner, { visibility: "SUMMARY_PUBLIC" })
        .expect(200);
    });

    it("revokes access: back to 404 on the details", async () => {
      await api
        .post(`ideas/${publicId}/access/${viewer.id}/revoke`, owner)
        .expect(201);
      const card = await api.get(`ideas/${publicId}`, viewer).expect(200);
      expect(card.body.data).toMatchObject({
        canViewDetails: false,
        myAccess: { status: "REVOKED" },
      });
      expect(leaks(card)).toBe(false);
      await api
        .patch(`ideas/${publicId}`, owner, { visibility: "PRIVATE" })
        .expect(200);
      const statuses = await everyEndpoint(viewer, publicId, publicRoleId);
      expect(statuses).toEqual(all404(statuses));
      await api
        .patch(`ideas/${publicId}`, owner, { visibility: "SUMMARY_PUBLIC" })
        .expect(200);
    });

    it("SECURITY: blocked users never see each other's ideas, even with access", async () => {
      const blocked = await api.actor([RoleMode.CUSTOMER]);
      await api
        .post(`ideas/${publicId}/access-requests`, blocked, {
          acceptConfidentiality: true,
        })
        .expect(201);
      await api
        .post(`ideas/${publicId}/access-requests/${blocked.id}/approve`, owner)
        .expect(201);
      expect((await api.get(`ideas/${publicId}`, blocked)).status).toBe(200);
      await api.db.userBlock.create({
        data: { blocker_user_id: blocked.id, blocked_user_id: owner.id },
      });
      const statuses = await everyEndpoint(blocked, publicId, publicRoleId);
      expect(statuses).toEqual(all404(statuses));
      const search = await api.get("ideas?q=mango", blocked).expect(200);
      expect(
        search.body.data.items.map((item: { id: string }) => item.id),
      ).not.toContain(publicId);
    });

    it("SECURITY: an owner who is not discoverable drops out of search and summaries", async () => {
      const shy = await api.actor([RoleMode.CUSTOMER], {
        trust: TrustLevel.IDENTITY,
      });
      const id = await idea(shy, {
        visibility: "SUMMARY_PUBLIC",
        title: "Shy idea",
      });
      expect((await api.get(`ideas/${id}`, outsider)).status).toBe(200);
      await api
        .put("profiles/me/privacy", shy, { discoverable: false })
        .expect(200);
      expect((await api.get(`ideas/${id}`, outsider)).status).toBe(404);
    });

    it("SECURITY: a hidden (moderated) or deleted idea is 404 for everyone but its owner", async () => {
      const id = await idea(owner, {
        visibility: "SUMMARY_PUBLIC",
        title: "Moderated",
      });
      await api.db.businessIdea.update({
        where: { id },
        data: {
          hidden_at: new Date(),
          hidden_reason: "Copied from someone else",
        },
      });
      expect((await api.get(`ideas/${id}`, outsider)).status).toBe(404);
      expect(
        (await api.get(`ideas/${id}`, owner).expect(200)).body.data,
      ).toMatchObject({
        status: "HIDDEN",
        hiddenReason: "Copied from someone else",
      });
      await api.delete(`ideas/${id}`, owner).expect(200);
      expect((await api.get(`ideas/${id}`, owner)).status).toBe(404);
    });

    it("lists my access requests", async () => {
      const mine = await api.get("me/idea-access", viewer).expect(200);
      expect(mine.body.data.items).toEqual([
        expect.objectContaining({
          ideaId: publicId,
          status: "REVOKED",
          canViewDetails: false,
        }),
      ]);
    });

    it("limits access requests to 10 a day", async () => {
      const curious = await api.actor([RoleMode.CUSTOMER]);
      const ids = [];
      for (let index = 0; index < 11; index += 1)
        ids.push(
          await idea(owner, {
            visibility: "SUMMARY_PUBLIC",
            title: `Idea ${index}`,
          }),
        );
      for (const id of ids.slice(0, 10))
        await api
          .post(`ideas/${id}/access-requests`, curious, {
            acceptConfidentiality: true,
          })
          .expect(201);
      const limited = await api
        .post(`ideas/${ids[10]}/access-requests`, curious, {
          acceptConfidentiality: true,
        })
        .expect(429);
      expect(limited.body.error.messageKey).toBe("error.idea.daily_limit");
    });
  });

  it("reports an idea and a role someone may see", async () => {
    const reporter = await api.actor([RoleMode.CUSTOMER]);
    await api
      .post("reports", reporter, {
        targetType: "IDEA",
        targetId: publicId,
        reasonCode: "SCAM",
        description: "This idea asks for money up front.",
      })
      .expect(201);
    await api
      .post("reports", reporter, {
        targetType: "IDEA_ROLE",
        targetId: publicRoleId,
        reasonCode: "INAPPROPRIATE_CONTENT",
        description: "The role description is offensive.",
      })
      .expect(201);
    const report = await api.db.report.findFirstOrThrow({
      where: { reporter_user_id: reporter.id, target_type: "IDEA" },
    });
    expect(report.subject_user_id).toBe(owner.id);
  });

  it("keeps the summary a single line and approvals stamped, in the database", async () => {
    await expect(
      api.db.businessIdea.update({
        where: { id: privateId },
        data: { summary: "x".repeat(161) },
      }),
    ).rejects.toThrow(/business_ideas_text_check/);
    await expect(
      api.db.ideaAccess.create({
        data: {
          idea_id: privateId,
          user_id: outsider.id,
          status: "APPROVED",
          confidentiality_accepted_at: new Date(),
        },
      }),
    ).rejects.toThrow(/idea_access_approval_check/);
  });
});

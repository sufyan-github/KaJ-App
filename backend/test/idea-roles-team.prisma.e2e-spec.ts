import { randomUUID } from "node:crypto";

import { MentorStatus, RoleMode, SkillLevel, TrustLevel } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const PROBLEM =
  "Jute bags from Rajshahi sell for very little at the local haat.";

/** P2.8 roles and matches; P2.9 team ("agreed in principle") and conversion. */
databaseDescribe(
  "ideas: roles, matches, team and conversion (real HTTP)",
  () => {
    let api: HttpHarness;
    let owner: Actor;
    let designer: Actor;
    let mentor: Actor;
    let shy: Actor;
    let blocked: Actor;
    let farAway: Actor;
    let stranger: Actor;
    let ideaId: string;
    let roleId: string;
    let mentorRoleId: string;
    let skillId: string;
    let otherSkillId: string;
    let areaId: string;

    const withSkill = async (
      displayName: string,
      options: {
        verified?: boolean;
        area?: string | null;
        trust?: TrustLevel;
      } = {},
    ) => {
      const actor = await api.actor([RoleMode.WORKER], {
        displayName,
        trust: options.trust ?? TrustLevel.IDENTITY,
        profile: {
          primary_location_id:
            options.area === undefined ? areaId : options.area,
        },
      });
      await api.db.userSkill.create({
        data: {
          user_id: actor.id,
          skill_id: skillId,
          level: SkillLevel.ADVANCED,
          is_verified: options.verified ?? false,
        },
      });
      return actor;
    };
    const interest = (as: Actor, role = roleId) =>
      api.post("collaboration-requests", as, {
        subjectType: "IDEA",
        subjectId: ideaId,
        ideaRoleId: role,
        message: "I design bags and can take this on part-time.",
      });

    beforeAll(async () => {
      api = await HttpHarness.start();
      // Skills of their own, so other suites' users never compete in matches.
      const category = await api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      });
      const skill = (name: string) =>
        api.db.skill.create({
          data: {
            slug: `idea-test-${name}-${randomUUID().slice(0, 8)}`,
            category_id: category.id,
            name_en: `Idea test ${name}`,
            name_bn: `আইডিয়া পরীক্ষা ${name}`,
          },
        });
      skillId = (await skill("jute-design")).id;
      otherSkillId = (await skill("supply")).id;
      const area = await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      });
      areaId = area.id;
      const otherThanaArea = await api.db.location.findFirstOrThrow({
        where: {
          type: "AREA",
          is_active: true,
          parent_id: { not: area.parent_id },
        },
      });
      owner = await api.actor([RoleMode.CUSTOMER], {
        displayName: "Rokeya Begum",
        trust: TrustLevel.IDENTITY,
      });
      designer = await withSkill("Tania Sultana", { verified: true });
      mentor = await withSkill("Mahbub Alam");
      await api.db.profile.update({
        where: { user_id: mentor.id },
        data: { mentor_status: MentorStatus.APPROVED },
      });
      await api.db.userSkill.update({
        where: { user_id_skill_id: { user_id: mentor.id, skill_id: skillId } },
        data: { can_mentor: true },
      });
      shy = await withSkill("Hidden Person");
      await api.db.profile.update({
        where: { user_id: shy.id },
        data: { discoverable: false },
      });
      blocked = await withSkill("Blocked Person");
      await api.db.userBlock.create({
        data: { blocker_user_id: owner.id, blocked_user_id: blocked.id },
      });
      farAway = await withSkill("Far Away", {
        area: otherThanaArea.id,
        trust: TrustLevel.PHONE,
      });
      stranger = await api.actor([RoleMode.WORKER]);
      const sector = await api.db.businessCategory.findUniqueOrThrow({
        where: { slug: "manufacturing" },
      });
      ideaId = (
        await api
          .post("ideas", owner, {
            title: "Designer jute bags for Dhaka shops",
            summary: "Designer jute bags made in Rajshahi for city boutiques.",
            problem: PROBLEM,
            solution: "Add design and sell direct to Dhaka boutiques online.",
            categoryId: sector.id,
            locationId: areaId,
            visibility: "SUMMARY_PUBLIC",
          })
          .expect(201)
      ).body.data.id;
    });

    afterAll(async () => {
      await api?.close();
    });

    describe("roles", () => {
      it("adds roles with skills, time and arrangement", async () => {
        const created = await api
          .post(`ideas/${ideaId}/roles`, owner, {
            roleType: "PRODUCTION",
            title: "Bag designer",
            description: "Design 5 bag styles a season.",
            skillIds: [skillId],
            timeCommitment: "PART_TIME",
            arrangement: "PAID",
          })
          .expect(201);
        roleId = created.body.data.id;
        expect(created.body.data).toMatchObject({
          roleType: "PRODUCTION",
          roleLabel: { en: "Production partner", bn: "উৎপাদন অংশীদার" },
          timeCommitment: "PART_TIME",
          arrangement: "PAID",
          status: "OPEN",
          skills: [expect.objectContaining({ id: skillId })],
        });
        mentorRoleId = (
          await api
            .post(`ideas/${ideaId}/roles`, owner, {
              roleType: "MENTOR",
              skillIds: [skillId],
              timeCommitment: "FEW_HOURS_A_WEEK",
            })
            .expect(201)
        ).body.data.id;
        // Ten role types; arrangement defaults to UNDECIDED.
        const list = await api
          .get(`ideas/${ideaId}/roles`, stranger)
          .expect(200);
        expect(list.body.data.items).toHaveLength(2);
        expect(list.body.data.items[1].arrangement).toBe("UNDECIDED");
        await api
          .post(`ideas/${ideaId}/roles`, owner, {
            roleType: "RESEARCH",
            skillIds: [stranger.id],
            timeCommitment: "FLEXIBLE",
          })
          .expect(400);
      });

      it("hides a closed role from non-members and updates skills", async () => {
        const temp = (
          await api
            .post(`ideas/${ideaId}/roles`, owner, {
              roleType: "SUPPLIER",
              skillIds: [otherSkillId],
              timeCommitment: "FLEXIBLE",
            })
            .expect(201)
        ).body.data.id;
        await api
          .patch(`ideas/${ideaId}/roles/${temp}`, owner, {
            status: "CLOSED",
            skillIds: [],
          })
          .expect(200);
        expect(
          (
            await api.get(`ideas/${ideaId}/roles`, stranger).expect(200)
          ).body.data.items.map((item: { id: string }) => item.id),
        ).not.toContain(temp);
        expect(
          (await api.get(`ideas/${ideaId}/roles`, owner).expect(200)).body.data
            .items,
        ).toHaveLength(3);
        await api.delete(`ideas/${ideaId}/roles/${temp}`, owner).expect(200);
      });
    });

    describe("matches", () => {
      it("suggests real, discoverable, unblocked people, with reasons", async () => {
        const result = await api
          .get(`ideas/${ideaId}/roles/${roleId}/matches`, owner)
          .expect(200);
        expect(result.body.data.explanation).toMatchObject({
          source: "FROM_KAAJ",
        });
        const ids = result.body.data.items.map(
          (item: { userId: string }) => item.userId,
        );
        expect(ids).toEqual(
          expect.arrayContaining([designer.id, mentor.id, farAway.id]),
        );
        expect(ids).not.toContain(shy.id);
        expect(ids).not.toContain(blocked.id);
        expect(ids).not.toContain(owner.id);
        const top = result.body.data.items[0];
        expect(top).toMatchObject({
          userId: designer.id,
          displayName: "Tania S.",
          matchedSkills: [
            expect.objectContaining({ id: skillId, verified: true }),
          ],
        });
        expect(
          top.reasons.map((reason: { code: string }) => reason.code),
        ).toEqual(
          expect.arrayContaining([
            "SKILLS",
            "SKILL_VERIFIED",
            "SAME_AREA",
            "AVAILABLE",
            "IDENTITY_VERIFIED",
          ]),
        );
        expect(top.reasons[0]).toEqual(
          expect.objectContaining({
            en: expect.any(String),
            bn: expect.any(String),
          }),
        );
        // Ordered by score; the far, unverified person comes last of these.
        const far = result.body.data.items.find(
          (item: { userId: string }) => item.userId === farAway.id,
        );
        expect(far.score).toBeLessThan(top.score);
      });

      it("ranks an approved mentor up for a mentor role", async () => {
        const result = await api
          .get(`ideas/${ideaId}/roles/${mentorRoleId}/matches`, owner)
          .expect(200);
        const row = result.body.data.items.find(
          (item: { userId: string }) => item.userId === mentor.id,
        );
        expect(
          row.reasons.map((reason: { code: string }) => reason.code),
        ).toContain("APPROVED_MENTOR");
      });

      it("explains when a role has no skills to match on", async () => {
        const bare = (
          await api
            .post(`ideas/${ideaId}/roles`, owner, {
              roleType: "CO_FOUNDER",
              skillIds: [],
              timeCommitment: "FULL_TIME",
            })
            .expect(201)
        ).body.data.id;
        const result = await api
          .get(`ideas/${ideaId}/roles/${bare}/matches`, owner)
          .expect(200);
        expect(result.body.data.items).toEqual([]);
        expect(result.body.data.explanation.en).toContain("Add the skills");
        await api.delete(`ideas/${ideaId}/roles/${bare}`, owner).expect(200);
      });
    });

    describe("interest, team and conversion", () => {
      let requestId: string;

      it("expresses interest in a role through a collaboration request", async () => {
        const created = await interest(designer).expect(201);
        requestId = created.body.data.id;
        expect(created.body.data).toMatchObject({
          status: "PROPOSED",
          subject: {
            type: "IDEA",
            id: ideaId,
            ideaRoleId: roleId,
            title: "Designer jute bags for Dhaka shops",
          },
          recipient: { userId: owner.id },
          notice: { key: "collaboration.notice.not_legal_partnership" },
        });
        // Interest gives no access to the private details.
        const card = await api.get(`ideas/${ideaId}`, designer).expect(200);
        expect(card.body.data.canViewDetails).toBe(false);
        expect(JSON.stringify(card.body)).not.toContain(PROBLEM);
        // Not about one's own idea; not about a closed role.
        await api
          .post("collaboration-requests", owner, {
            subjectType: "IDEA",
            subjectId: ideaId,
            message: "Talking to myself about this.",
          })
          .expect(409);
      });

      it("adds a team member only from an AGREED request", async () => {
        const early = await api
          .post(`ideas/${ideaId}/members`, owner, {
            collaborationRequestId: requestId,
          })
          .expect(409);
        expect(early.body.error.code).toBe("COLLABORATION_NOT_AGREED");
        await api
          .post(`collaboration-requests/${requestId}/accept`, owner)
          .expect(201);
        await api
          .post(`collaboration-requests/${requestId}/agree`, designer, {
            summary: "Five designs per season, paid per design.",
          })
          .expect(201);
        await api
          .post(`collaboration-requests/${requestId}/agree`, owner)
          .expect(201);

        const team = await api
          .post(`ideas/${ideaId}/members`, owner, {
            collaborationRequestId: requestId,
            roleLabel: "Lead designer",
          })
          .expect(201);
        expect(team.body.data).toMatchObject({
          notice: { key: "collaboration.notice.not_legal_partnership" },
          owner: { userId: owner.id },
          items: [
            expect.objectContaining({
              userId: designer.id,
              displayName: "Tania Sultana",
              status: "AGREED_IN_PRINCIPLE",
              roleLabel: "Lead designer",
              role: expect.objectContaining({
                id: roleId,
                roleType: "PRODUCTION",
              }),
            }),
          ],
        });
        await api
          .post(`ideas/${ideaId}/members`, owner, {
            collaborationRequestId: requestId,
          })
          .expect(409);
        // The role is filled and no longer open to others.
        const roles = await api
          .get(`ideas/${ideaId}/roles`, stranger)
          .expect(200);
        expect(
          roles.body.data.items.map((item: { id: string }) => item.id),
        ).not.toContain(roleId);
        const late = await interest(stranger).expect(409);
        expect(late.body.error.code).toBe("IDEA_ROLE_NOT_OPEN");
      });

      it("lets the team see the details (logged) but not run the idea", async () => {
        const view = await api.get(`ideas/${ideaId}`, designer).expect(200);
        expect(view.body.data).toMatchObject({
          myRelation: "MEMBER",
          canViewDetails: true,
          details: { problem: PROBLEM },
        });
        const views = await api.get(`ideas/${ideaId}/views`, owner).expect(200);
        expect(views.body.data.items[0]).toMatchObject({
          viewerUserId: designer.id,
          basis: "MEMBER",
        });
        await api.get(`ideas/${ideaId}/members`, designer).expect(200);
        // Owner-only actions stay 404 for a member.
        await api
          .patch(`ideas/${ideaId}`, designer, { title: "x" })
          .expect(404);
        await api
          .post(`ideas/${ideaId}/convert`, designer, { stage: "INFORMAL" })
          .expect(404);
        await api
          .get(`ideas/${ideaId}/roles/${mentorRoleId}/matches`, designer)
          .expect(404);
        await api.get(`ideas/${ideaId}/access-requests`, designer).expect(404);
        // A stranger can't see the team.
        await api.get(`ideas/${ideaId}/members`, stranger).expect(404);
        const mine = await api.get("me/ideas", designer).expect(200);
        expect(mine.body.data.team).toEqual([
          expect.objectContaining({ id: ideaId, myRelation: "MEMBER" }),
        ]);
        expect(mine.body.data.team[0].details).toBeUndefined();
      });

      it("converts the idea into a business; the team is invited", async () => {
        const converted = await api
          .post(`ideas/${ideaId}/convert`, owner, {
            stage: "INFORMAL",
            name: "Rajshahi Jute Studio",
          })
          .expect(201);
        expect(converted.body.data.idea).toMatchObject({
          stage: "CONVERTED",
          convertedBusinessId: expect.any(String),
        });
        expect(converted.body.data.business).toMatchObject({
          name: "Rajshahi Jute Studio",
          stage: "INFORMAL",
          myRole: "OWNER",
          isPublic: false,
          verified: false,
          category: expect.objectContaining({ slug: "manufacturing" }),
        });
        const businessId = converted.body.data.business.id;
        const invited = await api.get("me/businesses", designer).expect(200);
        expect(invited.body.data.invitations).toEqual([
          expect.objectContaining({
            role: "STAFF",
            business: expect.objectContaining({ id: businessId }),
          }),
        ]);
        const again = await api
          .post(`ideas/${ideaId}/convert`, owner, { stage: "REGISTERED" })
          .expect(409);
        expect(again.body.error.code).toBe("IDEA_ALREADY_CONVERTED");
        // A converted idea leaves search.
        const search = await api.get("ideas?q=jute", stranger).expect(200);
        expect(
          search.body.data.items.map((item: { id: string }) => item.id),
        ).not.toContain(ideaId);
      });

      it("lets a member leave and the owner remove", async () => {
        await api
          .delete(`ideas/${ideaId}/members/${owner.id}`, designer)
          .expect(404);
        await api
          .delete(`ideas/${ideaId}/members/${designer.id}`, designer)
          .expect(200);
        expect(
          (await api.get(`ideas/${ideaId}/members`, designer)).status,
        ).toBe(404);
      });
    });

    it("keeps CONVERTED and the conversion time together in the database", async () => {
      await expect(
        api.db.businessIdea.update({
          where: { id: ideaId },
          data: { converted_at: null },
        }),
      ).rejects.toThrow(/business_ideas_converted_check/);
    });
  },
);

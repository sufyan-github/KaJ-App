import { randomUUID } from "node:crypto";

import { RoleMode } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const NOTICE_KEY = "collaboration.notice.not_legal_partnership";

/** P2.4 partner directory and P2.5 collaboration requests. */
databaseDescribe(
  "partner directory and collaboration requests (real HTTP)",
  () => {
    let api: HttpHarness;
    let owner: Actor;
    let partner: Actor;
    let sectorId: string;
    let otherSectorId: string;
    let thanaId: string;
    let areaId: string;
    let businessId: string;

    const ids = (body: { data: { items: Array<{ id: string }> } }) =>
      body.data.items.map((item) => item.id);
    const directory = async (as: Actor, query = "") =>
      (await api.get(`partners?limit=100${query}`, as).expect(200)).body;
    const propose = (as: Actor, subjectId: string, extra: object = {}) =>
      api.post("collaboration-requests", as, {
        subjectType: "BUSINESS",
        subjectId,
        message: "I grow rice in Paba and can supply your kitchen weekly.",
        ...extra,
      });
    const publicBusiness = async (
      as: Actor,
      name: string,
      extra: object = {},
    ) =>
      (
        await api
          .post("businesses", as, {
            name,
            categoryId: sectorId,
            locationId: areaId,
            isPublic: true,
            seekingPartners: true,
            ...extra,
          })
          .expect(201)
      ).body.data.id as string;

    beforeAll(async () => {
      api = await HttpHarness.start();
      owner = await api.actor([RoleMode.BUSINESS], {
        displayName: "Monira Sultana",
      });
      partner = await api.actor([RoleMode.BUSINESS], {
        displayName: "Habib Rahman",
      });
      sectorId = (
        await api.db.businessCategory.findUniqueOrThrow({
          where: { slug: "food" },
        })
      ).id;
      otherSectorId = (
        await api.db.businessCategory.findUniqueOrThrow({
          where: { slug: "technology" },
        })
      ).id;
      const area = await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      });
      areaId = area.id;
      thanaId = area.parent_id!;
      businessId = await publicBusiness(owner, "Monira's Tiffin Service", {
        description: "Home-cooked lunch boxes for offices in Rajshahi.",
      });
    });

    afterAll(async () => {
      await api?.close();
    });

    describe("partner directory", () => {
      it("finds public businesses seeking partners by sector, area and words", async () => {
        expect(ids(await directory(partner))).toContain(businessId);
        expect(
          ids(await directory(partner, `&categoryId=${sectorId}`)),
        ).toContain(businessId);
        expect(
          ids(await directory(partner, `&categoryId=${otherSectorId}`)),
        ).not.toContain(businessId);
        // An area's thana includes it.
        expect(
          ids(await directory(partner, `&locationId=${thanaId}`)),
        ).toContain(businessId);
        expect(ids(await directory(partner, "&q=tiffin"))).toContain(
          businessId,
        );
        expect(ids(await directory(partner, "&q=bicycle"))).not.toContain(
          businessId,
        );
        const item = (await directory(partner)).data.items.find(
          (row: { id: string }) => row.id === businessId,
        );
        expect(item).toMatchObject({
          seekingPartners: true,
          owner: { displayName: "Monira S." },
        });
        expect(item.address).toBeUndefined();
      });

      it("leaves out private, not-seeking, own and suspended businesses", async () => {
        const notSeeking = await publicBusiness(owner, "Not looking", {
          seekingPartners: false,
        });
        const privateOne = (
          await api
            .post("businesses", owner, { name: "Private one" })
            .expect(201)
        ).body.data.id;
        const suspended = await publicBusiness(owner, "Suspended one");
        await api.db.businessProfile.update({
          where: { id: suspended },
          data: { suspended_at: new Date() },
        });
        const listed = ids(await directory(partner));
        expect(listed).not.toContain(notSeeking);
        expect(listed).not.toContain(privateOne);
        expect(listed).not.toContain(suspended);
        // Not your own.
        expect(ids(await directory(owner))).not.toContain(businessId);
      });

      it("respects blocks and an owner who is not discoverable", async () => {
        const blocked = await api.actor([RoleMode.BUSINESS]);
        await api.db.userBlock.create({
          data: { blocker_user_id: blocked.id, blocked_user_id: owner.id },
        });
        expect(ids(await directory(blocked))).not.toContain(businessId);

        const shy = await api.actor([RoleMode.BUSINESS]);
        const shyBusiness = await publicBusiness(shy, "Shy business");
        expect(ids(await directory(partner))).toContain(shyBusiness);
        await api
          .put("profiles/me/privacy", shy, { discoverable: false })
          .expect(200);
        expect(ids(await directory(partner))).not.toContain(shyBusiness);
      });

      it("pages with a cursor", async () => {
        const first = await api.get("partners?limit=1", partner).expect(200);
        expect(first.body.data.items).toHaveLength(1);
        expect(first.body.data.nextCursor).toEqual(expect.any(String));
        const second = await api
          .get(`partners?limit=1&cursor=${first.body.data.nextCursor}`, partner)
          .expect(200);
        expect(second.body.data.items[0].id).not.toBe(
          first.body.data.items[0].id,
        );
      });
    });

    describe("collaboration requests", () => {
      let requestId: string;
      let partnerBusinessId: string;

      beforeAll(async () => {
        partnerBusinessId = (
          await api
            .post("businesses", partner, { name: "Habib Rice Mill" })
            .expect(201)
        ).body.data.id;
      });

      it("proposes, with the notice on every response, and tells the owner", async () => {
        const created = await propose(partner, businessId, {
          fromBusinessId: partnerBusinessId,
        }).expect(201);
        requestId = created.body.data.id;
        expect(created.body.data).toMatchObject({
          status: "PROPOSED",
          role: "REQUESTER",
          subject: {
            type: "BUSINESS",
            id: businessId,
            title: "Monira's Tiffin Service",
          },
          recipient: { userId: owner.id, displayName: "Monira S." },
          fromBusiness: { id: partnerBusinessId, name: "Habib Rice Mill" },
          conversationId: null,
          allowedActions: ["WITHDRAW"],
          notice: {
            key: NOTICE_KEY,
            en: expect.any(String),
            bn: expect.any(String),
          },
        });
        expect(created.body.data.history).toEqual([
          expect.objectContaining({
            fromStatus: null,
            toStatus: "PROPOSED",
            by: "ME",
          }),
        ]);
        expect(
          await api.db.notification.count({
            where: { user_id: owner.id, type: "COLLABORATION_REQUEST" },
          }),
        ).toBe(1);

        const received = await api
          .get("collaboration-requests?box=received", owner)
          .expect(200);
        expect(received.body.data.notice.key).toBe(NOTICE_KEY);
        expect(received.body.data.items[0]).toMatchObject({
          id: requestId,
          role: "RECIPIENT",
          allowedActions: ["ACCEPT", "DECLINE"],
          notice: { key: NOTICE_KEY },
        });
        const sent = await api
          .get("collaboration-requests?box=sent", owner)
          .expect(200);
        expect(ids(sent.body)).not.toContain(requestId);
      });

      it("refuses a second open request, your own business, and a stranger's eyes", async () => {
        const again = await propose(partner, businessId).expect(409);
        expect(again.body.error.code).toBe("COLLABORATION_ALREADY_OPEN");
        const own = await propose(owner, businessId).expect(409);
        expect(own.body.error.code).toBe("OWN_SUBJECT");
        const stranger = await api.actor([RoleMode.CUSTOMER]);
        await api
          .get(`collaboration-requests/${requestId}`, stranger)
          .expect(404);
        await api
          .post(`collaboration-requests/${requestId}/accept`, stranger)
          .expect(404);
        // fromBusinessId must be the requester's own.
        const other = await api.actor([RoleMode.BUSINESS]);
        await propose(other, businessId, {
          fromBusinessId: partnerBusinessId,
        }).expect(400);
      });

      it("lets only the recipient accept, which opens a conversation", async () => {
        const wrongSide = await api
          .post(`collaboration-requests/${requestId}/accept`, partner)
          .expect(409);
        expect(wrongSide.body.error).toMatchObject({
          code: "COLLABORATION_TRANSITION_NOT_ALLOWED",
        });
        const accepted = await api
          .post(`collaboration-requests/${requestId}/accept`, owner, {
            note: "Let's talk about weekly volumes.",
          })
          .expect(201);
        expect(accepted.body.data).toMatchObject({
          status: "ACCEPTED",
          conversationId: expect.any(String),
          allowedActions: ["WITHDRAW", "AGREE"],
          // Connected: full names now.
          requester: { displayName: "Habib Rahman" },
        });
        const conversationId = accepted.body.data.conversationId;
        const participants = await api.db.conversationParticipant.findMany({
          where: { conversation_id: conversationId },
        });
        expect(participants.map((row) => row.user_id).sort()).toEqual(
          [owner.id, partner.id].sort(),
        );
        await api
          .post(`conversations/${conversationId}/messages`, partner, {
            type: "TEXT",
            body: "Assalamu alaikum, how many kg a week?",
            clientNonce: randomUUID(),
          })
          .expect((response) => {
            if (![200, 201].includes(response.status))
              throw new Error(JSON.stringify(response.body));
          });
      });

      it("records agreement only when both sides confirm, then ends", async () => {
        const first = await api
          .post(`collaboration-requests/${requestId}/agree`, partner, {
            summary:
              "Weekly 50 kg rice supply, cash on delivery, trial for a month.",
          })
          .expect(201);
        expect(first.body.data).toMatchObject({
          status: "ACCEPTED",
          agreement: {
            summary:
              "Weekly 50 kg rice supply, cash on delivery, trial for a month.",
            agreedByMe: true,
            agreedByThem: false,
            agreedAt: null,
          },
        });
        // Changing the summary needs the other side again.
        const changed = await api
          .post(`collaboration-requests/${requestId}/agree`, owner, {
            summary:
              "Weekly 40 kg rice supply, cash on delivery, trial for a month.",
          })
          .expect(201);
        expect(changed.body.data).toMatchObject({
          status: "ACCEPTED",
          agreement: { agreedByMe: true, agreedByThem: false },
        });
        const agreed = await api
          .post(`collaboration-requests/${requestId}/agree`, partner)
          .expect(201);
        expect(agreed.body.data).toMatchObject({
          status: "AGREED",
          agreement: {
            summary:
              "Weekly 40 kg rice supply, cash on delivery, trial for a month.",
            agreedByMe: true,
            agreedByThem: true,
            agreedAt: expect.any(String),
          },
          allowedActions: ["END"],
          notice: { key: NOTICE_KEY },
        });
        const ended = await api
          .post(`collaboration-requests/${requestId}/end`, owner, {
            note: "Season over.",
          })
          .expect(201);
        expect(ended.body.data).toMatchObject({
          status: "ENDED",
          closedAt: expect.any(String),
          allowedActions: [],
        });
        expect(
          ended.body.data.history.map(
            (event: { toStatus: string }) => event.toStatus,
          ),
        ).toEqual([
          "PROPOSED",
          "ACCEPTED",
          "ACCEPTED",
          "ACCEPTED",
          "AGREED",
          "ENDED",
        ]);
        await api
          .post(`collaboration-requests/${requestId}/end`, owner)
          .expect(409);
      });

      it("declines and withdraws", async () => {
        const decliner = await api.actor([RoleMode.BUSINESS]);
        const declined = await propose(decliner, businessId).expect(201);
        const result = await api
          .post(
            `collaboration-requests/${declined.body.data.id}/decline`,
            owner,
            {
              note: "Not this season.",
            },
          )
          .expect(201);
        expect(result.body.data.status).toBe("DECLINED");
        // A closed request allows a new one.
        const second = await propose(decliner, businessId).expect(201);
        const withdrawn = await api
          .post(
            `collaboration-requests/${second.body.data.id}/withdraw`,
            decliner,
          )
          .expect(201);
        expect(withdrawn.body.data).toMatchObject({
          status: "WITHDRAWN",
          conversationId: null,
        });
      });

      it("hides a request from both sides after a block", async () => {
        const requester = await api.actor([RoleMode.BUSINESS]);
        const created = await propose(requester, businessId).expect(201);
        await api.db.userBlock.create({
          data: { blocker_user_id: owner.id, blocked_user_id: requester.id },
        });
        await api
          .get(`collaboration-requests/${created.body.data.id}`, requester)
          .expect(404);
        await api
          .get(`collaboration-requests/${created.body.data.id}`, owner)
          .expect(404);
        expect(
          ids(
            (await api.get("collaboration-requests", owner).expect(200)).body,
          ),
        ).not.toContain(created.body.data.id);
        // And no new request to a blocked owner's business.
        await propose(
          requester,
          await publicBusiness(owner, "Another one"),
        ).expect(404);
      });

      it("refuses a private business", async () => {
        const quiet = await api.actor([RoleMode.BUSINESS]);
        const privateId = (
          await api
            .post("businesses", quiet, { name: "Quiet kitchen" })
            .expect(201)
        ).body.data.id;
        await propose(partner, privateId).expect(404);
      });

      it("limits a person to 10 new requests a day", async () => {
        const busy = await api.actor([RoleMode.BUSINESS]);
        const owners = await Promise.all(
          Array.from({ length: 11 }, () => api.actor([RoleMode.BUSINESS])),
        );
        for (let index = 0; index < 10; index += 1)
          await propose(
            busy,
            await publicBusiness(owners[index]!, `Target ${index}`),
          ).expect(201);
        const limited = await propose(
          busy,
          await publicBusiness(owners[10]!, "Target 10"),
        ).expect(429);
        expect(limited.body.error).toMatchObject({
          code: "RATE_LIMITED",
          messageKey: "error.collaboration.daily_limit",
        });
        expect(limited.headers["retry-after"]).toBeDefined();
      });

      it("keeps the parties and agreement rules in the database", async () => {
        await expect(
          api.db.collaborationRequest.create({
            data: {
              requester_user_id: owner.id,
              recipient_user_id: owner.id,
              subject_type: "BUSINESS",
              subject_id: businessId,
              message: "self",
            },
          }),
        ).rejects.toThrow(/collaboration_requests_parties_check/);
        await expect(
          api.db.collaborationRequest.create({
            data: {
              requester_user_id: partner.id,
              recipient_user_id: owner.id,
              subject_type: "BUSINESS",
              subject_id: partnerBusinessId,
              message: "agreed without confirmations",
              status: "AGREED",
            },
          }),
        ).rejects.toThrow(/collaboration_requests_agreed_check/);
      });
    });
  },
);

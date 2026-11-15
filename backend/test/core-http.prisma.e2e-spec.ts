import { randomUUID } from "node:crypto";
import { ModerationLevel, RoleMode } from "@prisma/client";
import sharp from "sharp";

import { STORAGE_PORT } from "../src/infra/storage/storage.port";
import { HttpHarness, Actor } from "./support/http-harness";
import { MemoryStorage } from "./support/memory-storage";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * Core HTTP paths that only had service-level or no tests: chat REST,
 * reviews, notifications and uploads, through the real app.
 */
databaseDescribe("core HTTP paths (real app)", () => {
  let api: HttpHarness;
  const storage = new MemoryStorage();

  beforeAll(async () => {
    api = await HttpHarness.start((builder) =>
      builder.overrideProvider(STORAGE_PORT).useValue(storage),
    );
  });

  afterAll(async () => {
    await api?.close();
  });

  describe("chat over REST", () => {
    let poster: Actor;
    let worker: Actor;
    let conversationId: string;

    const send = (as: Actor, body: string, nonce = randomUUID()) =>
      api.post(`conversations/${conversationId}/messages`, as, {
        type: "TEXT",
        body,
        clientNonce: nonce,
      });

    beforeAll(async () => {
      poster = await api.actor([RoleMode.CUSTOMER]);
      worker = await api.actor([RoleMode.WORKER]);
      const jobId = await api.openJob(poster);
      await api.apply(jobId, worker);
      conversationId = (
        await api
          .post(`jobs/${jobId}/conversations`, poster, {
            participantUserId: worker.id,
          })
          .expect(201)
      ).body.data.id;
    });

    it("opens the same conversation again instead of a duplicate", async () => {
      const again = await api
        .post(
          `jobs/${(await api.db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).job_id}/conversations`,
          worker,
          { participantUserId: poster.id },
        )
        .expect(201);
      expect(again.body.data.id).toBe(conversationId);
    });

    it("sends, de-duplicates by client nonce, and pages messages", async () => {
      const nonce = randomUUID();
      const first = await send(
        worker,
        "Hello, I can come at 10.",
        nonce,
      ).expect(201);
      expect(first.body.data).toMatchObject({
        body: "Hello, I can come at 10.",
        isMine: true,
        safetyWarning: false,
      });
      // A retried send with the same nonce returns the same message.
      const retried = await send(
        worker,
        "Hello, I can come at 10.",
        nonce,
      ).expect(201);
      expect(retried.body.data.id).toBe(first.body.data.id);
      await send(poster, "Great, see you then.").expect(201);

      const page = await api
        .get(`conversations/${conversationId}/messages?limit=10`, poster)
        .expect(200);
      const bodies = page.body.data.items.map(
        (item: { body: string }) => item.body,
      );
      expect(bodies).toEqual(
        expect.arrayContaining([
          "Hello, I can come at 10.",
          "Great, see you then.",
        ]),
      );
      expect(
        bodies.filter((body: string) => body === "Hello, I can come at 10."),
      ).toHaveLength(1);
      // Outsiders can't read it.
      const outsider = await api.actor([RoleMode.CUSTOMER]);
      await api
        .get(`conversations/${conversationId}/messages`, outsider)
        .expect(404);
    });

    it("flags an off-platform payment request", async () => {
      const response = await send(
        worker,
        "Send the advance to my bKash 01812345678",
      ).expect(201);
      expect(response.body.data.safetyWarning).toBe(true);
    });

    it("counts unread messages and clears them on read", async () => {
      await send(worker, "Are you there?").expect(201);
      const unread = async () =>
        (
          await api.get("conversations", poster).expect(200)
        ).body.data.items.find(
          (item: { id: string }) => item.id === conversationId,
        ).unreadCount;
      expect(await unread()).toBeGreaterThan(0);
      await api
        .post(`conversations/${conversationId}/read`, poster)
        .expect(201);
      expect(await unread()).toBe(0);
    });

    it("lets the sender delete only their own message", async () => {
      const mine = (await send(worker, "Typo, ignore this.").expect(201)).body
        .data.id;
      await api.delete(`messages/${mine}`, poster).expect(404);
      await api.delete(`messages/${mine}`, worker).expect(200);
      const page = await api
        .get(`conversations/${conversationId}/messages`, worker)
        .expect(200);
      expect(
        page.body.data.items.map((item: { id: string }) => item.id),
      ).not.toContain(mine);
    });

    it("rejects an empty text and a system message", async () => {
      await api
        .post(`conversations/${conversationId}/messages`, worker, {
          type: "TEXT",
          body: "   ",
          clientNonce: randomUUID(),
        })
        .expect(400);
      await api
        .post(`conversations/${conversationId}/messages`, worker, {
          type: "SYSTEM",
          body: "I am the system",
          clientNonce: randomUUID(),
        })
        .expect(400);
    });

    it("lets a restricted user still report the conversation", async () => {
      const restricted = await api.actor([RoleMode.WORKER], {
        moderationLevel: ModerationLevel.RESTRICT,
      });
      const jobId = await api.openJob(poster);
      await api.db.application.create({
        data: { job_id: jobId, worker_user_id: restricted.id },
      });
      const conversation = await api.db.conversation.create({
        data: {
          job_id: jobId,
          scope_key: `${jobId}:${restricted.id}`,
          participants: {
            create: [{ user_id: poster.id }, { user_id: restricted.id }],
          },
        },
      });
      await api
        .post(`conversations/${conversation.id}/messages`, restricted, {
          type: "TEXT",
          body: "Hello",
          clientNonce: randomUUID(),
        })
        .expect(403);
      await api
        .post(`conversations/${conversation.id}/report`, restricted, {
          description: "The poster asked me to pay a fee in advance.",
        })
        .expect(201);
      expect(
        await api.db.report.count({
          where: {
            reporter_user_id: restricted.id,
            target_id: conversation.id,
          },
        }),
      ).toBe(1);
    });
  });

  describe("reviews", () => {
    let poster: Actor;
    let worker: Actor;
    let assignmentId: string;

    beforeAll(async () => {
      poster = await api.actor([RoleMode.CUSTOMER]);
      worker = await api.actor([RoleMode.WORKER]);
      ({ assignmentId } = await api.completedAssignment(poster, worker));
    });

    it("lets both parties review once, blind until both have, and updates the rating", async () => {
      const before = await api
        .get(`assignments/${assignmentId}/reviews`, poster)
        .expect(200);
      expect(before.body.data).toMatchObject({
        canReview: true,
        myReview: null,
        receivedReview: null,
      });

      await api
        .post(`assignments/${assignmentId}/reviews`, poster, {
          rating: 5,
          punctuality: 5,
          quality: 4,
          comment: "Careful and on time.",
        })
        .expect(201);
      await api
        .post(`assignments/${assignmentId}/reviews`, poster, { rating: 4 })
        .expect(409);
      // The worker can't see the poster's review before writing their own.
      const blind = await api
        .get(`assignments/${assignmentId}/reviews`, worker)
        .expect(200);
      expect(blind.body.data).toMatchObject({
        revealed: false,
        receivedReview: null,
        canReview: true,
      });

      await api
        .post(`assignments/${assignmentId}/reviews`, worker, {
          rating: 4,
          comment: "Clear instructions.",
        })
        .expect(201);
      const after = await api
        .get(`assignments/${assignmentId}/reviews`, poster)
        .expect(200);
      expect(after.body.data).toMatchObject({
        canReview: false,
        revealed: true,
        myReview: expect.objectContaining({ rating: 5 }),
        receivedReview: expect.objectContaining({ rating: 4 }),
      });

      const received = await api.get("reviews/received", worker).expect(200);
      expect(received.body.data.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ rating: 5 })]),
      );
      const reputation = await api.get("me/reputation", worker).expect(200);
      expect(Number(reputation.body.data.ratingAverage)).toBeGreaterThan(0);
    });

    it("rejects an out-of-range rating", async () => {
      await api
        .post(`assignments/${assignmentId}/reviews`, worker, { rating: 6 })
        .expect(400);
    });

    it("keeps outsiders out", async () => {
      const outsider = await api.actor([RoleMode.CUSTOMER]);
      await api
        .post(`assignments/${assignmentId}/reviews`, outsider, { rating: 1 })
        .expect(404);
    });

    it("closes the review window seven days after completion", async () => {
      const other = await api.completedAssignment(poster, worker);
      await api.db.job.update({
        where: { id: other.jobId },
        data: { completed_at: new Date(Date.now() - 8 * 86_400_000) },
      });
      const response = await api
        .post(`assignments/${other.assignmentId}/reviews`, poster, {
          rating: 5,
        })
        .expect(409);
      expect(response.body.error.message).toContain("review window");
    });
  });

  describe("notifications", () => {
    let poster: Actor;
    let worker: Actor;

    beforeAll(async () => {
      poster = await api.actor([RoleMode.CUSTOMER]);
      worker = await api.actor([RoleMode.WORKER]);
      const jobId = await api.openJob(poster);
      await api.apply(jobId, worker); // notifies the poster
    });

    it("lists, counts, reads one and reads all", async () => {
      const list = await api.get("notifications", poster).expect(200);
      expect(list.body.data.unreadCount).toBeGreaterThan(0);
      const [first] = list.body.data.items;
      expect(first).toMatchObject({ id: expect.any(String) });

      await api.post(`notifications/${first.id}/read`, poster).expect(201);
      // Someone else's notification is not found.
      await api.post(`notifications/${first.id}/read`, worker).expect(404);

      const all = await api.post("notifications/read-all", poster).expect(201);
      expect(all.body.data.updatedCount).toBeGreaterThanOrEqual(0);
      expect(
        (await api.get("notifications", poster).expect(200)).body.data
          .unreadCount,
      ).toBe(0);
    });

    it("counts unread beyond the 100 listed", async () => {
      await api.db.notification.createMany({
        data: Array.from({ length: 105 }, (_, index) => ({
          user_id: worker.id,
          type: "TEST",
          title_key: `Test ${index}`,
          body_key: "Synthetic notification",
        })),
      });
      const list = await api.get("notifications", worker).expect(200);
      expect(list.body.data.items.length).toBeLessThanOrEqual(100);
      expect(list.body.data.unreadCount).toBeGreaterThanOrEqual(105);
    });

    it("saves an in-app preference", async () => {
      await api
        .put("notifications/preferences", poster, {
          channel: "IN_APP",
          type: "CHAT_MESSAGE",
          isEnabled: false,
        })
        .expect(200);
      const prefs = await api
        .get("notifications/preferences", poster)
        .expect(200);
      expect(prefs.body.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            channel: "IN_APP",
            type: "CHAT_MESSAGE",
            isEnabled: false,
          }),
        ]),
      );
    });
  });

  describe("uploads", () => {
    let user: Actor;

    beforeAll(async () => {
      user = await api.actor([RoleMode.WORKER]);
    });

    async function upload(kind: string, mime: string, body: Uint8Array) {
      const signed = await api
        .post("uploads/sign", user, { kind, mime, sizeBytes: body.byteLength })
        .expect(201);
      // Stands in for the app's PUT to the presigned URL.
      storage.put(signed.body.data.key, body, mime);
      return api.post("uploads/complete", user, {
        kind,
        mime,
        sizeBytes: body.byteLength,
        key: signed.body.data.key,
      });
    }

    const png = async () =>
      new Uint8Array(
        await sharp({
          create: {
            width: 8,
            height: 8,
            channels: 3,
            background: { r: 200, g: 80, b: 40 },
          },
        })
          .png()
          .toBuffer(),
      );

    it("signs, verifies and re-encodes an image, then serves it to its owner", async () => {
      const completed = await upload("CHAT_IMAGE", "image/png", await png());
      expect(completed.status).toBe(201);
      const documentId = completed.body.data.documentId;
      expect(completed.body.data.mime).toBe("image/webp");
      const document = await api.db.document.findUniqueOrThrow({
        where: { id: documentId },
      });
      expect(document.storage_key.startsWith("private/documents/")).toBe(true);
      expect(storage.objects.has(document.storage_key)).toBe(true);
      // The pending object is removed once it is verified.
      expect(
        [...storage.objects.keys()].some((key) =>
          key.startsWith(`private/pending/${user.id}/`),
        ),
      ).toBe(false);

      const download = await api
        .get(`uploads/documents/${documentId}/download`, user)
        .expect(200);
      expect(download.body.data.downloadUrl).toContain(document.storage_key);
      const other = await api.actor([RoleMode.CUSTOMER]);
      await api
        .get(`uploads/documents/${documentId}/download`, other)
        .expect(404);
    });

    it("stores a profile photo as resized variants and sets it on the profile", async () => {
      const completed = await upload("PROFILE_PHOTO", "image/png", await png());
      expect(completed.status).toBe(201);
      expect(completed.body.data.variants).toMatchObject({
        large: expect.stringContaining(`profile/${user.id}/`),
      });
      const profile = await api.db.profile.findUniqueOrThrow({
        where: { user_id: user.id },
      });
      expect(profile.photo_key).toBe(completed.body.data.key);
    });

    it("rejects a file whose bytes don't match its type", async () => {
      const fake = new TextEncoder().encode("not really a png file");
      const response = await upload("PROFILE_PHOTO", "image/png", fake);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.body.error.code).toMatch(/^UPLOAD_/);
    });

    it("rejects a type or size the kind does not allow", async () => {
      await api
        .post("uploads/sign", user, {
          kind: "PORTFOLIO_IMAGE",
          mime: "application/pdf",
          sizeBytes: 100,
        })
        .expect((response) => expect(response.status).toBeLessThan(500))
        .expect((response) =>
          expect(response.status).toBeGreaterThanOrEqual(400),
        );
      const tooBig = await api.post("uploads/sign", user, {
        kind: "PROFILE_PHOTO",
        mime: "image/png",
        sizeBytes: 50 * 1024 * 1024,
      });
      expect(tooBig.body.error.code).toBe("UPLOAD_REQUEST_INVALID");
    });

    it("refuses to complete someone else's pending upload", async () => {
      const signed = await api
        .post("uploads/sign", user, {
          kind: "PROFILE_PHOTO",
          mime: "image/png",
          sizeBytes: 10,
        })
        .expect(201);
      const other = await api.actor([RoleMode.WORKER]);
      const response = await api.post("uploads/complete", other, {
        kind: "PROFILE_PHOTO",
        mime: "image/png",
        sizeBytes: 10,
        key: signed.body.data.key,
      });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("UPLOAD_KEY_INVALID");
    });
  });
});

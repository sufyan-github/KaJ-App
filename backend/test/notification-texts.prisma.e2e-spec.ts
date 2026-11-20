import { RoleMode } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** Every notification type the backend sends (R3 / W14). */
const TYPES = [
  "ADMIN_CAMPAIGN",
  "APPLICATION_ACCEPTED",
  "ASSIGNMENT_CANCELLED",
  "ASSIGNMENT_CONFIRMED",
  "ASSIGNMENT_DECLINED",
  "BOOKING_REQUESTED",
  "BUSINESS_INVITATION",
  "BUSINESS_MEMBER_REMOVED",
  "CASH_PAYMENT_RECORDED",
  "CERTIFICATE_REVOKED",
  "CHAT_MESSAGE",
  "COLLABORATION_ACCEPTED",
  "COLLABORATION_AGREEMENT",
  "COLLABORATION_DECLINED",
  "COLLABORATION_ENDED",
  "COLLABORATION_REQUEST",
  "COLLABORATION_WITHDRAWN",
  "COMMUNITY_ANNOUNCEMENT",
  "COMMUNITY_INVITATION",
  "COMMUNITY_JOIN_APPROVED",
  "COMMUNITY_JOIN_REQUEST",
  "DISPUTE_APPEALED",
  "DISPUTE_EVIDENCE_ADDED",
  "DISPUTE_OPENED",
  "DISPUTE_RESOLVED",
  "GROUP_CHAT_MESSAGE",
  "IDEA_ACCESS_APPROVED",
  "IDEA_ACCESS_DECLINED",
  "IDEA_ACCESS_REQUESTED",
  "IDEA_TEAM_ADDED",
  "INTRODUCTION_ACCEPTED",
  "INTRODUCTION_DECLINED",
  "INTRODUCTION_EXPIRED",
  "INTRODUCTION_REQUEST",
  "JOB_ALERT_MATCH",
  "JOB_APPLICATION_RECEIVED",
  "LEARNING_ACCEPTED",
  "LEARNING_APPLICATION",
  "LEARNING_COMPLETED",
  "LEARNING_DECLINED",
  "LEARNING_RESTORED",
  "LEARNING_SESSION_RECORDED",
  "LEARNING_SUSPENDED",
  "LEARNING_WITHDRAWN",
  "MENTOR_REINSTATED",
  "MENTOR_SUSPENDED",
  "REVIEW_RECEIVED",
  "SESSION_ANNOUNCED",
  "SESSION_CANCELLED",
  "SESSION_COMPLETED",
  "SESSION_CONFIRMED",
  "SESSION_DECLINED",
  "SESSION_INVITE",
  "SESSION_REMINDER",
  "SESSION_UPDATED",
  "SESSION_WAITLIST_PROMOTED",
  "TRAINING_CERTIFICATE_ISSUED",
  "VERIFICATION_DECIDED",
  "VERIFICATION_SUBMITTED",
  "WORKER_CHECKED_IN",
  "WORK_REVIEW_REMINDER",
  "WORK_SUBMITTED",
];

const GENERIC_EN = ["KAAJ update", "There is a new update about your work."];
const GENERIC_BN = ["KAAJ আপডেট", "আপনার কাজের একটি নতুন আপডেট এসেছে।"];

/**
 * R3 / W14: every notification reads specifically in English as well as
 * Bangla; moderation and content notices say what happened in both.
 */
databaseDescribe("notification texts in Bangla and English (real HTTP)", () => {
  let api: HttpHarness;
  let user: Actor;

  const read = async () =>
    (await api.get("notifications?limit=100", user).expect(200)).body.data
      .items as Array<{
      type: string;
      titleBn: string;
      bodyBn: string;
      titleEn: string;
      bodyEn: string;
    }>;

  beforeAll(async () => {
    api = await HttpHarness.start();
    user = await api.actor([RoleMode.WORKER]);
  });

  afterAll(async () => {
    await api?.close();
  });

  it("gives every type a specific English title and body", async () => {
    await api.db.notification.createMany({
      data: TYPES.map((type) => ({
        user_id: user.id,
        type,
        // As the services store them: Bangla text written at send time.
        title_key: "একটি বাংলা শিরোনাম",
        body_key: "একটি বাংলা বার্তা, যা অনুবাদ করা যায় না।",
      })),
    });
    const items = await read();
    const missing = TYPES.filter((type) => {
      const item = items.find((row) => row.type === type);
      return (
        !item ||
        GENERIC_EN.includes(item.titleEn) ||
        GENERIC_EN.includes(item.bodyEn)
      );
    });
    expect(missing).toEqual([]);
  });

  it("says what a moderation step or hidden content was, in both languages", async () => {
    await api.db.notification.deleteMany({ where: { user_id: user.id } });
    await api.db.notification.createMany({
      data: [
        {
          user_id: user.id,
          type: "MODERATION_ACTION",
          title_key: "moderation.action.title",
          body_key: "moderation.action.body",
          payload_json: { level: "WARN", expiresAt: null },
        },
        {
          user_id: user.id,
          type: "CONTENT_HIDDEN",
          title_key: "moderation.content_hidden.title",
          body_key: "moderation.content_hidden.body",
          payload_json: {
            targetType: "GROUP",
            title: "Rajshahi tailors",
            reason: "Asked for fees by bKash.",
          },
        },
        {
          user_id: user.id,
          type: "MODERATION_RESTORED",
          title_key: "moderation.restored.title",
          body_key: "moderation.restored.body",
          payload_json: { moderationLevel: "NONE" },
        },
      ],
    });
    const items = await read();
    for (const item of items) {
      expect(GENERIC_BN).not.toContain(item.titleBn);
      expect(GENERIC_BN).not.toContain(item.bodyBn);
      expect(GENERIC_EN).not.toContain(item.titleEn);
      expect(GENERIC_EN).not.toContain(item.bodyEn);
    }
    const warning = items.find((item) => item.type === "MODERATION_ACTION")!;
    expect(warning.titleEn.toLowerCase()).toContain("warning");
    expect(warning.titleBn).toContain("সতর্ক");
    const hidden = items.find((item) => item.type === "CONTENT_HIDDEN")!;
    expect(hidden.bodyEn).toContain("Rajshahi tailors");
    expect(hidden.bodyEn).toContain("Asked for fees by bKash.");
    expect(hidden.bodyBn).toContain("Rajshahi tailors");
  });
});

import { MentorStatus, RoleMode } from "@prisma/client";

import { CONTACT_HIDDEN } from "../src/modules/chat/chat-safety";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const PHONE = "01812349012";
const EMAIL = "c@example.com";

/**
 * R1 / API-8: before an introduction or a collaboration request is accepted,
 * the other person sees no phone number or e-mail typed into its text.
 */
databaseDescribe("contact details in first-contact text (real HTTP)", () => {
  let api: HttpHarness;

  beforeAll(async () => {
    api = await HttpHarness.start();
  });

  afterAll(async () => {
    await api?.close();
  });

  it("masks an introduction's message and goal for the expert until accepted", async () => {
    const requester = await api.actor([RoleMode.CUSTOMER]);
    const expert = await api.actor([RoleMode.MENTOR, RoleMode.WORKER]);
    await api.db.profile.update({
      where: { user_id: expert.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    const created = await api
      .post("introductions", requester, {
        expertUserId: expert.id,
        contextType: "LEARNING_GOAL",
        learningGoal: `Bookkeeping; text me on ${PHONE}`,
        message: `Call me ${PHONE} or mail ${EMAIL}`,
      })
      .expect(201);
    const id = created.body.data.id;
    // The requester sees their own words.
    expect(created.body.data.message).toContain(PHONE);

    const seen = await api.get(`introductions/${id}`, expert).expect(200);
    const text = JSON.stringify(seen.body.data);
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain(EMAIL);
    expect(seen.body.data.message).toBe(
      `Call me ${CONTACT_HIDDEN} or mail ${CONTACT_HIDDEN}`,
    );
    const inbox = await api
      .get("introductions?box=received", expert)
      .expect(200);
    expect(JSON.stringify(inbox.body.data)).not.toContain(PHONE);

    await api.post(`introductions/${id}/accept`, expert, {}).expect(201);
    const after = await api.get(`introductions/${id}`, expert).expect(200);
    expect(after.body.data.message).toContain(PHONE);
  });

  it("masks a collaboration request's message for the recipient until accepted", async () => {
    const owner = await api.actor([RoleMode.BUSINESS]);
    const partner = await api.actor([RoleMode.BUSINESS]);
    const sector = await api.db.businessCategory.findUniqueOrThrow({
      where: { slug: "food" },
    });
    const area = await api.db.location.findFirstOrThrow({
      where: { type: "AREA", is_active: true },
    });
    const businessId = (
      await api
        .post("businesses", owner, {
          name: "Screening Tiffin",
          categoryId: sector.id,
          locationId: area.id,
          isPublic: true,
          seekingPartners: true,
        })
        .expect(201)
    ).body.data.id;
    const created = await api
      .post("collaboration-requests", partner, {
        subjectType: "BUSINESS",
        subjectId: businessId,
        message: `Call me on ${PHONE} or mail ${EMAIL} please`,
      })
      .expect(201);
    const id = created.body.data.id;
    expect(created.body.data.message).toContain(PHONE);

    const seen = await api.get(`collaboration-requests/${id}`, owner);
    expect(seen.status).toBe(200);
    expect(JSON.stringify(seen.body.data)).not.toContain(PHONE);
    expect(JSON.stringify(seen.body.data)).not.toContain(EMAIL);
    const inbox = await api.get("collaboration-requests", owner).expect(200);
    expect(JSON.stringify(inbox.body.data)).not.toContain(PHONE);

    await api.post(`collaboration-requests/${id}/accept`, owner).expect(201);
    const after = await api
      .get(`collaboration-requests/${id}`, owner)
      .expect(200);
    expect(after.body.data.message).toContain(PHONE);
  });
});

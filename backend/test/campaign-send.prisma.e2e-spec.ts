import "reflect-metadata";

import { AdminRole, PrismaClient } from "@prisma/client";

import { Clock } from "../src/common/time/clock";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { StoragePort } from "../src/infra/storage/storage.port";
import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { CampaignRunner } from "../src/modules/admin-ops/campaign.runner";
import { LedgerService } from "../src/modules/payments/ledger.service";

const databaseDescribe =
  process.env.TRUST_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * Before: send wrote notifications for the first `throttlePerMinute`
 * recipients only, stored the campaign as PARTIAL and never sent the rest.
 */
databaseDescribe("admin campaign send continues past the first batch", () => {
  const prisma = new PrismaClient();
  const db = prisma as unknown as PrismaService;
  const clock: Clock = { now: () => new Date() };
  const ops = new AdminOpsService(
    db,
    {} as StoragePort,
    clock,
    new LedgerService(db),
  );
  const runner = new CampaignRunner(ops);
  const context = { ip: "127.0.0.1", ua: "campaign-test" };
  const userIds: string[] = [];
  const groupIds: string[] = [];
  let admin: {
    userId: string;
    email: string;
    role: AdminRole;
    sessionId: string;
  };

  async function user(name = "Campaign test user") {
    const created = await prisma.user.create({
      data: {
        phone_e164: `+88010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        profile: { create: { display_name: name } },
      },
    });
    userIds.push(created.id);
    return created.id;
  }

  /** A community group with `size` active members: a closed audience. */
  async function audience(size: number) {
    const owner = await user("Campaign group owner");
    const group = await prisma.communityGroup.create({
      data: { created_by_user_id: owner, name: "Campaign test group" },
    });
    groupIds.push(group.id);
    const members: string[] = [];
    for (let index = 0; index < size; index += 1) {
      const id = await user(`Campaign member ${index}`);
      members.push(id);
      await prisma.communityGroupMember.create({
        data: {
          group_id: group.id,
          user_id: id,
          status: "ACTIVE",
          joined_at: new Date(),
        },
      });
    }
    return { groupId: group.id, members };
  }

  function received(campaignId: string) {
    return prisma.notification.findMany({
      where: {
        type: "ADMIN_CAMPAIGN",
        payload_json: { path: ["campaignId"], equals: campaignId },
      },
      select: { user_id: true },
    });
  }

  function campaignInput(groupId: string, throttlePerMinute: number) {
    return {
      name: "Batch test",
      title: "Notice",
      body: "A notice for the group.",
      segment: { communityGroupId: groupId },
      throttlePerMinute,
    };
  }

  beforeAll(async () => {
    const adminId = await user("Campaign admin");
    await prisma.user.update({
      where: { id: adminId },
      data: { email: `campaign-admin-${adminId}@test.invalid` },
    });
    admin = {
      userId: adminId,
      email: "campaign-admin@test.invalid",
      role: AdminRole.ADMIN,
      sessionId: "campaign-test",
    };
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { user_id: { in: userIds } },
    });
    await prisma.notificationCampaign.deleteMany({
      where: { created_by: { in: userIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { actor_user_id: { in: userIds } },
    });
    await prisma.communityGroup.deleteMany({ where: { id: { in: groupIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("sends 5 recipients in batches of 2 and then completes", async () => {
    const { groupId, members } = await audience(5);

    const started = await ops.sendCampaign(
      campaignInput(groupId, 2),
      admin,
      context,
    );
    expect(started).toMatchObject({
      audienceCount: 5,
      sentCount: 2,
      status: "SENDING",
    });
    expect(await received(started.id)).toHaveLength(2);

    // A user who joins after the send started is not added to it.
    const late = await user("Late joiner");
    await prisma.communityGroupMember.create({
      data: {
        group_id: groupId,
        user_id: late,
        status: "ACTIVE",
        joined_at: new Date(),
      },
    });

    await runner.run();
    let row = await prisma.notificationCampaign.findUniqueOrThrow({
      where: { id: started.id },
    });
    expect([row.sent_count, row.status]).toEqual([4, "SENDING"]);

    await runner.run();
    row = await prisma.notificationCampaign.findUniqueOrThrow({
      where: { id: started.id },
    });
    expect([row.sent_count, row.status]).toEqual([5, "COMPLETED"]);
    expect(row.sent_at).not.toBeNull();

    // Nothing more once completed.
    await runner.run();
    const delivered = (await received(started.id)).map((n) => n.user_id);
    expect(delivered.sort()).toEqual([...members].sort());
    expect(delivered).not.toContain(late);
  });

  it("completes early when recipients leave the segment mid-send", async () => {
    const { groupId, members } = await audience(4);
    const started = await ops.sendCampaign(
      campaignInput(groupId, 2),
      admin,
      context,
    );
    expect(started.sentCount).toBe(2);
    const sent = new Set((await received(started.id)).map((n) => n.user_id));
    const unsent = members.filter((id) => !sent.has(id));
    await prisma.communityGroupMember.updateMany({
      where: { group_id: groupId, user_id: unsent[0] },
      data: { status: "REMOVED", removed_at: new Date() },
    });

    await ops.continueCampaigns();
    const row = await prisma.notificationCampaign.findUniqueOrThrow({
      where: { id: started.id },
    });
    expect([row.sent_count, row.status]).toEqual([3, "COMPLETED"]);
  });

  it("an audience that fits in one batch completes at once", async () => {
    const { groupId } = await audience(2);
    const started = await ops.sendCampaign(
      campaignInput(groupId, 100),
      admin,
      context,
    );
    expect(started).toMatchObject({
      audienceCount: 2,
      sentCount: 2,
      status: "COMPLETED",
    });
  });

  it("lists campaigns with their progress", async () => {
    const page = await ops.campaigns({ limit: 2 }, admin, context);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]!.createdBy).toMatch(/^campaign-admin-/u);
    expect(page.nextCursor).not.toBeNull();
  });
});

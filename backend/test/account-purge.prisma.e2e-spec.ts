import { randomUUID } from "node:crypto";
import { RoleMode, UserStatus } from "@prisma/client";

import { AccountPurgeService } from "../src/modules/users/account-purge.service";
import { HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const DAY = 86_400_000;

/**
 * R2 / PRIV-1, DB-2: 30 days after someone asks to delete their account,
 * their personal data is removed and their phone number is free again.
 * Work records (jobs, assignments, payments, reviews) stay, without a name.
 */
databaseDescribe("account purge (PostgreSQL)", () => {
  let api: HttpHarness;

  // A storage stand-in: the purge deletes objects before it touches rows.
  const deleted: string[] = [];
  let purge: AccountPurgeService;

  beforeAll(async () => {
    api = await HttpHarness.start();
    purge = new AccountPurgeService(
      api.db,
      {
        deleteObject: async (key: string) => {
          deleted.push(key);
        },
      } as never,
      { now: () => new Date() } as never,
    );
  });

  afterAll(async () => {
    await api?.close();
  });

  const deletedAccount = async (daysAgo: number) => {
    const actor = await api.actor([RoleMode.WORKER], {
      displayName: "Rahima Khatun",
    });
    await api.delete("me", actor).expect(200);
    await api.db.user.update({
      where: { id: actor.id },
      data: {
        deleted_at: new Date(Date.now() - daysAgo * DAY),
        email: `purge-${randomUUID().slice(0, 8)}@kaj.test`,
      },
    });
    await api.db.profile.update({
      where: { user_id: actor.id },
      data: { bio: "I sew at home.", birth_year: 1990, lat: 24.37, lng: 88.6 },
    });
    await api.db.document.create({
      data: {
        user_id: actor.id,
        kind: "NID_FRONT",
        storage_key: `test/purge/${randomUUID()}.jpg`,
        mime: "image/jpeg",
        size_bytes: 1000n,
      },
    });
    return actor;
  };

  it("removes personal data after 30 days and frees the phone number", async () => {
    const old = await deletedAccount(31);
    const phone = (
      await api.db.user.findUniqueOrThrow({ where: { id: old.id } })
    ).phone_e164!;

    const result = await purge.purgeDue();
    expect(result.purged).toBeGreaterThanOrEqual(1);

    const user = await api.db.user.findUniqueOrThrow({
      where: { id: old.id },
      include: { profile: true },
    });
    expect(user).toMatchObject({
      phone_e164: null,
      email: null,
      password_hash: null,
      mobile_password_hash: null,
      status: UserStatus.PENDING_DELETION,
    });
    expect(user.purged_at).not.toBeNull();
    expect(user.profile).toMatchObject({
      bio: null,
      birth_year: null,
      lat: null,
      lng: null,
      photo_key: null,
    });
    expect(user.profile?.display_name).not.toContain("Rahima");
    expect(
      await api.db.document.count({
        where: { user_id: old.id, deleted_at: null },
      }),
    ).toBe(0);
    expect(deleted.some((key) => key.startsWith("test/purge/"))).toBe(true);
    expect(
      await api.db.refreshToken.count({ where: { user_id: old.id } }),
    ).toBe(0);
    // The number can sign up again.
    await api.db.user.create({ data: { phone_e164: phone } });
  });

  it("leaves an account inside the 30 days alone", async () => {
    const recent = await deletedAccount(5);
    await purge.purgeDue();
    const user = await api.db.user.findUniqueOrThrow({
      where: { id: recent.id },
    });
    expect(user.phone_e164).not.toBeNull();
    expect(user.purged_at).toBeNull();
  });
});

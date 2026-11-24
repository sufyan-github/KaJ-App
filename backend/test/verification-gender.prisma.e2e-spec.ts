import { randomUUID } from "node:crypto";
import {
  AdminRole,
  Gender,
  RoleMode,
  TrustLevel,
  VerificationStatus,
} from "@prisma/client";

import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R7 / B1: gender is declared on the identity verification, confirmed by
 * the admin decision and then locked (including null -> value); only an
 * audited admin correction changes it afterwards.
 */
databaseDescribe(
  "gender declared with identity verification (real HTTP)",
  () => {
    let api: HttpHarness;
    let ops: AdminOpsService;
    const context = { ip: "127.0.0.1", ua: "b1-test" };

    const evidence = async (user: Actor) => {
      const make = async () =>
        (
          await api.db.document.create({
            data: {
              user_id: user.id,
              kind: "VERIFICATION_DOCUMENT",
              storage_key: `private/documents/${user.id}/${randomUUID()}.jpg`,
              mime: "image/jpeg",
              size_bytes: 2000,
              is_sensitive: true,
            },
          })
        ).id;
      return { nidDocumentId: await make(), selfieDocumentId: await make() };
    };
    const admin = async () => ({
      userId: (await api.actor([RoleMode.CUSTOMER])).id,
      email: "admin@kaj.test",
      role: AdminRole.ADMIN,
      sessionId: randomUUID(),
    });

    beforeAll(async () => {
      api = await HttpHarness.start();
      ops = api.app.get(AdminOpsService);
    });

    afterAll(async () => {
      await api?.close();
    });

    it("asks for gender when the profile has none, and the decision confirms it", async () => {
      const person = await api.actor([RoleMode.WORKER], {
        trust: TrustLevel.PHONE,
      });
      await api.db.profile.update({
        where: { user_id: person.id },
        data: { gender: null },
      });
      const missing = await api
        .post("verification-requests", person, {
          kind: "IDENTITY",
          ...(await evidence(person)),
        })
        .expect(400);
      expect(missing.body.error).toMatchObject({
        code: "GENDER_REQUIRED",
        field: "gender",
      });

      const submitted = await api
        .post("verification-requests", person, {
          kind: "IDENTITY",
          ...(await evidence(person)),
          gender: "FEMALE",
        })
        .expect(201);
      expect(submitted.body.data.declaredGender).toBe("FEMALE");

      const queue = await ops.verifications(
        { limit: 100, status: VerificationStatus.PENDING } as never,
        await admin(),
        context,
      );
      const item = queue.items.find(
        (row: { id: string }) => row.id === submitted.body.data.id,
      ) as { declaredGender?: string; profileGender?: string | null };
      expect(item).toMatchObject({
        declaredGender: "FEMALE",
        profileGender: null,
      });

      await ops.decideVerification(
        submitted.body.data.id,
        {
          status: VerificationStatus.APPROVED,
          reason: "NID and selfie match.",
        },
        await admin(),
        context,
      );
      const profile = await api.db.profile.findUniqueOrThrow({
        where: { user_id: person.id },
      });
      expect(profile.gender).toBe(Gender.FEMALE);
      expect(profile.trust_level).toBe(TrustLevel.IDENTITY);
    });

    it("locks gender after approval, also from empty", async () => {
      const verified = await api.actor([RoleMode.WORKER], {
        trust: TrustLevel.IDENTITY,
      });
      await api.db.profile.update({
        where: { user_id: verified.id },
        data: { gender: null },
      });
      const refused = await api
        .put("profiles/me", verified, {
          displayName: "Locked",
          gender: "FEMALE",
        })
        .expect(409);
      expect(refused.body.error.code).toBe("GENDER_LOCKED");
    });

    it("lets an admin correct it, with an audit row", async () => {
      const person = await api.actor([RoleMode.WORKER], {
        trust: TrustLevel.IDENTITY,
        profile: { gender: Gender.MALE },
      });
      const actor = await admin();
      await ops.correctGender(
        person.id,
        { gender: Gender.FEMALE, reason: "NID shows female; typo at signup." },
        actor,
        context,
      );
      expect(
        (
          await api.db.profile.findUniqueOrThrow({
            where: { user_id: person.id },
          })
        ).gender,
      ).toBe(Gender.FEMALE);
      expect(
        await api.db.auditLog.count({
          where: { action: "ADMIN_GENDER_CORRECTED", entity_id: person.id },
        }),
      ).toBe(1);
    });
  },
);

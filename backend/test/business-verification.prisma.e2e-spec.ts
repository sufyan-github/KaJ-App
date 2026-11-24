import { randomUUID } from "node:crypto";
import {
  AdminRole,
  RoleMode,
  TrustLevel,
  VerificationStatus,
} from "@prisma/client";

import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { BusinessAdminService } from "../src/modules/business/business-admin.service";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P2.6: verification of a registered business, and the sector taxonomy. */
databaseDescribe(
  "business verification and sector taxonomy (real HTTP)",
  () => {
    let api: HttpHarness;
    let ops: AdminOpsService;
    let businessAdmin: BusinessAdminService;
    let admin: {
      userId: string;
      email: string;
      role: AdminRole;
      sessionId: string;
    };
    let owner: Actor;
    let manager: Actor;
    let businessId: string;
    const context = { ip: "127.0.0.1", ua: "business-verification-test" };

    async function evidence(as: Actor) {
      return (
        await api.db.document.create({
          data: {
            user_id: as.id,
            kind: "VERIFICATION_DOCUMENT",
            storage_key: `private/documents/${as.id}/${randomUUID()}.pdf`,
            mime: "application/pdf",
            size_bytes: 2000,
            is_sensitive: true,
          },
        })
      ).id;
    }
    const submit = async (as: Actor, status: number, id = businessId) =>
      api
        .post(`businesses/${id}/verification`, as, {
          documentIds: [await evidence(as)],
        })
        .expect(status);
    const decide = (requestId: string, status: VerificationStatus) =>
      ops.decideVerification(
        requestId,
        { status, reason: "Trade licence checked by the test." },
        admin,
        context,
      );

    beforeAll(async () => {
      api = await HttpHarness.start();
      ops = api.app.get(AdminOpsService);
      businessAdmin = api.app.get(BusinessAdminService);
      const adminUser = await api.actor([RoleMode.CUSTOMER]);
      admin = {
        userId: adminUser.id,
        email: "business-admin@kaj.test",
        role: AdminRole.ADMIN,
        sessionId: randomUUID(),
      };
      // Identity verified, no skill verification: enough for a business.
      owner = await api.actor([RoleMode.BUSINESS], {
        trust: TrustLevel.IDENTITY,
      });
      manager = await api.actor([RoleMode.BUSINESS], {
        trust: TrustLevel.IDENTITY,
      });
      businessId = (
        await api
          .post("businesses", owner, {
            name: "Padma Agro Traders",
            stage: "INFORMAL",
          })
          .expect(201)
      ).body.data.id;
      await api
        .post(`businesses/${businessId}/members`, owner, {
          userId: manager.id,
          role: "MANAGER",
        })
        .expect(201);
      await api
        .post(`businesses/${businessId}/membership/accept`, manager)
        .expect(201);
    });

    afterAll(async () => {
      await api?.close();
    });

    it("can't verify an informal business, or one without a licence number", async () => {
      const informal = await submit(owner, 409);
      expect(informal.body.error.code).toBe("BUSINESS_NOT_REGISTERED");
      await api
        .patch(`businesses/${businessId}`, owner, { stage: "REGISTERED" })
        .expect(200);
      await submit(owner, 409);
      const status = await api
        .get(`businesses/${businessId}/verification`, manager)
        .expect(200);
      expect(status.body.data).toMatchObject({
        verificationStatus: "NOT_SUBMITTED",
        verified: false,
        canSubmit: false,
        latestRequest: null,
      });
    });

    it("needs identity verification, not skill verification", async () => {
      const phoneOnly = await api.actor([RoleMode.BUSINESS], {
        trust: TrustLevel.PHONE,
      });
      const id = (
        await api
          .post("businesses", phoneOnly, {
            name: "Unverified owner shop",
            stage: "REGISTERED",
            tradeLicenceNo: "RAJ-2026-11111",
          })
          .expect(201)
      ).body.data.id;
      await submit(phoneOnly, 409, id);
    });

    it("lets only an owner submit, and refuses the generic route", async () => {
      await api
        .patch(`businesses/${businessId}`, owner, {
          tradeLicenceNo: "RAJ-2026-04567",
        })
        .expect(200);
      await submit(manager, 404);
      const generic = await api
        .post("verification-requests", owner, {
          kind: "BUSINESS",
          documentIds: [await evidence(owner)],
        })
        .expect(400);
      expect(generic.body.error.code).toBe("USE_BUSINESS_VERIFICATION");
    });

    it("queues a registered business for admins and approves it", async () => {
      const submitted = await submit(owner, 201);
      expect(submitted.body.data).toMatchObject({
        verificationStatus: "PENDING",
        verified: false,
        canSubmit: false,
        latestRequest: { status: "PENDING" },
      });
      await submit(owner, 409);

      const queue = await ops.verifications(
        { limit: 100, kind: "BUSINESS" } as never,
        admin,
        context,
      );
      const item = queue.items.find(
        (row: { id: string }) =>
          row.id === submitted.body.data.latestRequest.id,
      );
      expect(item).toMatchObject({
        kind: "BUSINESS",
        user: { id: owner.id },
        business: {
          id: businessId,
          name: "Padma Agro Traders",
          stage: "REGISTERED",
          tradeLicenceNo: "RAJ-2026-04567",
        },
      });

      const decided = await decide(item!.id, VerificationStatus.APPROVED);
      // The business is verified; the owner's trust ladder doesn't move.
      expect(decided.trustLevel).toBe(TrustLevel.IDENTITY);
      expect(
        (
          await api.db.profile.findUniqueOrThrow({
            where: { user_id: owner.id },
          })
        ).trust_level,
      ).toBe(TrustLevel.IDENTITY);
      const outsider = await api.actor([RoleMode.CUSTOMER]);
      await api
        .patch(`businesses/${businessId}`, owner, {
          isPublic: true,
          categoryId: (
            await api.db.businessCategory.findUniqueOrThrow({
              where: { slug: "agriculture" },
            })
          ).id,
          locationId: (
            await api.db.location.findFirstOrThrow({
              where: { is_active: true },
            })
          ).id,
        })
        .expect(200);
      expect(
        (await api.get(`businesses/${businessId}`, outsider).expect(200)).body
          .data.verified,
      ).toBe(true);
      await submit(owner, 409);
    });

    it("drops the badge when the business leaves REGISTERED, and can't approve it then", async () => {
      await api
        .patch(`businesses/${businessId}`, owner, { stage: "INFORMAL" })
        .expect(200);
      await api
        .patch(`businesses/${businessId}`, owner, { stage: "REGISTERED" })
        .expect(200);
      const again = await submit(owner, 201);
      await api
        .patch(`businesses/${businessId}`, owner, { stage: "INFORMAL" })
        .expect(200);
      await expect(
        decide(again.body.data.latestRequest.id, VerificationStatus.APPROVED),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "BUSINESS_NOT_REGISTERED" }),
      });
      // Rejecting still works.
      await decide(
        again.body.data.latestRequest.id,
        VerificationStatus.REJECTED,
      );
      const status = await api
        .get(`businesses/${businessId}/verification`, owner)
        .expect(200);
      expect(status.body.data).toMatchObject({
        verificationStatus: "REJECTED",
        verified: false,
        latestRequest: {
          status: "REJECTED",
          rejectionReason: expect.any(String),
        },
      });
    });

    describe("sector taxonomy (admin)", () => {
      it("adds a sub-sector, renames and deactivates, with an audit trail", async () => {
        const agriculture = await api.db.businessCategory.findUniqueOrThrow({
          where: { slug: "agriculture" },
        });
        const slug = `fisheries-${randomUUID().slice(0, 6)}`;
        const created = await businessAdmin.saveCategory(
          null,
          {
            parentId: agriculture.id,
            slug,
            nameEn: "Fisheries",
            nameBn: "মৎস্য",
            reason: "Catalogue change for the test.",
          },
          admin,
          context,
        );
        expect(created).toMatchObject({
          parentId: agriculture.id,
          isActive: true,
        });
        const listed = await api.get("business-categories").expect(200);
        expect(
          listed.body.data.items.map((item: { slug: string }) => item.slug),
        ).toContain(slug);

        await businessAdmin.saveCategory(
          created.id,
          {
            parentId: agriculture.id,
            slug,
            nameEn: "Fish farming",
            nameBn: "মাছ চাষ",
            isActive: false,
            reason: "Catalogue change for the test.",
          },
          admin,
          context,
        );
        expect(
          (
            await api.get("business-categories").expect(200)
          ).body.data.items.map((item: { slug: string }) => item.slug),
        ).not.toContain(slug);
        expect(
          await api.db.auditLog.count({
            where: { entity: "BUSINESS_CATEGORY", entity_id: created.id },
          }),
        ).toBe(2);

        await expect(
          businessAdmin.saveCategory(
            null,
            {
              slug,
              nameEn: "Duplicate",
              nameBn: "ডুপ্লিকেট",
              reason: "Catalogue change for the test.",
            },
            admin,
            context,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: "BUSINESS_CATEGORY_SLUG_TAKEN",
          }),
        });
        // Only two levels.
        await expect(
          businessAdmin.saveCategory(
            null,
            {
              parentId: created.id,
              slug: `${slug}-x`,
              nameEn: "Too deep",
              nameBn: "অনেক গভীর",
              reason: "Catalogue change for the test.",
            },
            admin,
            context,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ field: "parentId" }),
        });
      });

      it("keeps the admin routes behind the admin session", async () => {
        await api.get("admin/business-categories", owner).expect(401);
      });
    });
  },
);

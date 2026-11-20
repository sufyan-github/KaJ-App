import "reflect-metadata";
import { randomUUID } from "node:crypto";

import { AdminRole, RoleMode } from "@prisma/client";

import { adminSession } from "./support/admin-session";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.TRUST_DATABASE_E2E === "1" ? describe : describe.skip;

/** R5: cursor paging and search on admin lists; audit filters and export. */
databaseDescribe(
  "admin list paging, audit filters and export (real HTTP)",
  () => {
    let api: HttpHarness;
    let admin: Actor & { email: string };
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const action = `R5_TEST_${tag}`;

    beforeAll(async () => {
      api = await HttpHarness.start();
      admin = await adminSession(api, AdminRole.ADMIN);
    });

    afterAll(async () => {
      await api.db.auditLog.deleteMany({
        where: { OR: [{ actor_user_id: admin.id }, { action }] },
      });
      await api?.close();
    });

    async function pages(path: string, limit: number) {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 10; page += 1) {
        const response = await api.get(
          `${path}${path.includes("?") ? "&" : "?"}limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`,
          admin,
        );
        expect(response.status).toBe(200);
        seen.push(...response.body.data.items.map((i: { id: string }) => i.id));
        cursor = response.body.data.nextCursor;
        if (!cursor) break;
      }
      return seen;
    }

    it("pages users found by search without repeats", async () => {
      for (let index = 0; index < 5; index += 1) {
        const user = await api.actor([RoleMode.CUSTOMER]);
        await api.db.profile.update({
          where: { user_id: user.id },
          data: { display_name: `Paged ${tag} ${index}` },
        });
      }
      const ids = await pages(`admin/users?search=Paged%20${tag}`, 2);
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
      const first = await api.get(
        `admin/users?search=Paged%20${tag}&limit=2`,
        admin,
      );
      expect(first.body.data.total).toBe(5);
    });

    it("pages jobs and applications", async () => {
      const poster = await api.actor([RoleMode.CUSTOMER]);
      const jobs: string[] = [];
      for (let index = 0; index < 3; index += 1)
        jobs.push(
          await api.openJob(poster, { title: `Paged job ${tag} ${index}` }),
        );
      const jobIds = await pages(`admin/jobs?search=Paged%20job%20${tag}`, 2);
      expect(jobIds.sort()).toEqual([...jobs].sort());
      const worker = await api.actor([RoleMode.WORKER]);
      for (const job of jobs) await api.apply(job, worker);
      const applicationIds = await pages(
        `admin/applications?search=Paged%20job%20${tag}`,
        2,
      );
      expect(new Set(applicationIds).size).toBe(3);
    });

    it("filters the audit log and hides list views on request", async () => {
      const at = (minutes: number) => new Date(Date.now() - minutes * 60_000);
      await api.db.auditLog.createMany({
        data: [
          {
            action,
            entity: "R5_TEST",
            actor_user_id: admin.id,
            created_at: at(30),
          },
          {
            action,
            entity: "R5_TEST",
            actor_user_id: admin.id,
            created_at: at(20),
          },
          {
            action,
            entity: "R5_TEST",
            actor_user_id: null,
            created_at: at(10),
          },
        ],
      });
      const byAction = await pages(`admin/audit-logs?action=${action}`, 2);
      expect(byAction).toHaveLength(3);

      const byActor = await api.get(
        `admin/audit-logs?action=${action}&actorEmail=${encodeURIComponent(admin.email.toUpperCase())}`,
        admin,
      );
      expect(byActor.body.data.items).toHaveLength(2);

      const window = await api.get(
        `admin/audit-logs?action=${action}&from=${at(25).toISOString()}&to=${at(5).toISOString()}`,
        admin,
      );
      expect(window.body.data.items).toHaveLength(2);

      const views = await api.get(
        "admin/audit-logs?action=ADMIN_AUDIT_LOG_VIEWED&changesOnly=true",
        admin,
      );
      expect(views.body.data.items).toEqual([]);

      expect(
        (await api.get("admin/audit-logs?action=lower-case", admin)).status,
      ).toBe(400);
      expect(
        (await api.get("admin/audit-logs?from=yesterday", admin)).status,
      ).toBe(400);
    });

    it("exports the filtered audit log as CSV, ADMIN only, and audits it", async () => {
      await api.db.auditLog.create({
        data: {
          action,
          entity: "R5_TEST",
          actor_user_id: admin.id,
          after_json: { note: "=1+1, with a comma" },
        },
      });
      const response = await api.get(
        `admin/audit-logs/export?action=${action}`,
        admin,
      );
      expect(response.status).toBe(200);
      const { csv, rowCount, truncated, filename } = response.body.data;
      expect(filename).toMatch(/^kaaj-audit-.*\.csv$/u);
      expect(truncated).toBe(false);
      expect(rowCount).toBeGreaterThanOrEqual(1);
      const lines = (csv as string).trim().split("\r\n");
      expect(lines[0]).toBe(
        "created_at,action,entity,entity_id,actor_email,actor_user_id,ip,user_agent,before_json,after_json",
      );
      expect(lines).toHaveLength(rowCount + 1);
      expect(csv).toContain(admin.email);
      expect(csv).toContain('"{""note"":""=1+1, with a comma""}"');

      const exportRow = await api.db.auditLog.findFirst({
        where: { action: "ADMIN_AUDIT_LOG_EXPORTED", actor_user_id: admin.id },
      });
      expect(exportRow?.after_json).toMatchObject({
        rowCount,
        truncated: false,
      });

      const support = await adminSession(api, AdminRole.SUPPORT);
      expect(
        (await api.get(`admin/audit-logs/export?action=${action}`, support))
          .status,
      ).toBe(403);
    });
  },
);

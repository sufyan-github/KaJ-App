import { randomUUID } from "node:crypto";
import {
  AdminRole,
  JobStatus,
  Prisma,
  RoleMode,
  SkillLevel,
} from "@prisma/client";

import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { MatchingService } from "../src/modules/matching/matching.service";
import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

databaseDescribe("P0.6 job status rules and matching order (database)", () => {
  let api: HttpHarness;
  let ops: AdminOpsService;
  let poster: Actor;
  let admin: {
    userId: string;
    email: string;
    role: AdminRole;
    sessionId: string;
  };
  let categoryId: string;
  let locationId: string;
  const context = { ip: "127.0.0.1", ua: "data-hygiene-test" };
  const slot = futureSlot(8);

  async function openJob(extra: Record<string, unknown> = {}) {
    const created = await api
      .post("jobs", poster, {
        title: "Data hygiene test job",
        description: "A synthetic job used only by the data hygiene test.",
        categoryId,
        skillIds: [],
        locationId,
        jobType: "ONE_TIME",
        paymentModel: "FIXED",
        budgetMinPoisha: "10000",
        budgetMaxPoisha: "20000",
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        ...extra,
      })
      .expect(201);
    await api.post(`jobs/${created.body.data.id}/publish`, poster).expect(201);
    return created.body.data.id as string;
  }

  const force = (id: string, toStatus: JobStatus) =>
    ops.forceTransition(
      id,
      { toStatus, reason: "Data hygiene test transition." },
      admin,
      context,
    );

  beforeAll(async () => {
    api = await HttpHarness.start();
    ops = api.app.get(AdminOpsService);
    poster = await api.actor([RoleMode.CUSTOMER]);
    const adminUser = await api.actor([RoleMode.CUSTOMER]);
    admin = {
      userId: adminUser.id,
      email: "data-hygiene@kaj.test",
      role: AdminRole.ADMIN,
      sessionId: randomUUID(),
    };
    categoryId = (
      await api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      })
    ).id;
    locationId = (
      await api.db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  describe("admin force-transition goes through the job status rules", () => {
    it("suspends an open job and restores it to where it was", async () => {
      const id = await openJob();
      await expect(force(id, JobStatus.SUSPENDED)).resolves.toMatchObject({
        status: JobStatus.SUSPENDED,
      });
      // The admin list shows the allowed next states.
      const list = await ops.jobs(
        { limit: 100, search: "Data hygiene test job" } as never,
        admin,
        context,
      );
      const listed = list.items.find((item) => item.id === id)!;
      expect(listed.allowedTransitions.sort()).toEqual(
        [
          JobStatus.APPLICATIONS_OPEN,
          JobStatus.EXPIRED,
          JobStatus.CANCELLED_BY_CUSTOMER,
        ].sort(),
      );

      await expect(
        force(id, JobStatus.APPLICATIONS_OPEN),
      ).resolves.toMatchObject({ status: JobStatus.APPLICATIONS_OPEN });
      const history = await api.db.jobStatusHistory.findMany({
        where: { job_id: id, actor_type: "ADMIN" },
        orderBy: { created_at: "asc" },
      });
      expect(history.map((row) => [row.from_status, row.to_status])).toEqual([
        [JobStatus.APPLICATIONS_OPEN, JobStatus.SUSPENDED],
        [JobStatus.SUSPENDED, JobStatus.APPLICATIONS_OPEN],
      ]);
    });

    it("refuses a jump the rules don't allow, naming the allowed states", async () => {
      const id = await openJob();
      const error = await force(id, JobStatus.IN_PROGRESS).catch(
        (caught: { getResponse(): Record<string, unknown> }) =>
          caught.getResponse(),
      );
      expect(error).toMatchObject({
        code: "JOB_TRANSITION_NOT_ALLOWED",
        details: expect.arrayContaining([
          { allowedStatus: JobStatus.SUSPENDED },
        ]),
      });
      expect(
        (await api.db.job.findUniqueOrThrow({ where: { id } })).status,
      ).toBe(JobStatus.APPLICATIONS_OPEN);
    });

    it("sends a disputed job to dispute resolution", async () => {
      const id = await openJob();
      await api.db.job.update({
        where: { id },
        data: { status: JobStatus.DISPUTED },
      });
      await expect(force(id, JobStatus.COMPLETED)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: "JOB_TRANSITION_NOT_ALLOWED",
        }),
      });
    });
  });

  describe("matching candidates", () => {
    it("are ordered by distance to the job, then rating", async () => {
      const skill = await api.db.skill.create({
        data: {
          slug: `distance-test-${randomUUID()}`,
          category_id: categoryId,
          name_en: "Distance test skill",
          name_bn: "দূরত্ব পরীক্ষা দক্ষতা",
        },
      });
      // Job pin in Rajshahi; workers 0.5 km, 3 km, 20 km away and unknown.
      const site = { lat: 24.3745, lng: 88.6042 };
      const make = async (
        label: string,
        point: { lat: number; lng: number } | null,
        rating: number,
      ) => {
        const worker = await api.actor([RoleMode.WORKER], {
          displayName: label,
          profile: point
            ? {
                lat: new Prisma.Decimal(point.lat),
                lng: new Prisma.Decimal(point.lng),
              }
            : {},
        });
        await api.db.workerProfile.update({
          where: { user_id: worker.id },
          data: { rating_avg: rating },
        });
        await api.db.userSkill.create({
          data: {
            user_id: worker.id,
            skill_id: skill.id,
            level: SkillLevel.INTERMEDIATE,
          },
        });
        return worker.id;
      };
      const far = await make("Far", { lat: 24.5545, lng: 88.6042 }, 5);
      const unknown = await make("Unknown", null, 5);
      const near = await make("Near", { lat: 24.379, lng: 88.6042 }, 3);
      const middle = await make("Middle", { lat: 24.4015, lng: 88.6042 }, 4);
      const jobId = await openJob({ skillIds: [skill.id], ...site });

      const matching = api.app.get(MatchingService) as unknown as {
        workers(
          jobId: string,
          exclude: string[],
          skillIds?: string[],
        ): Promise<Array<{ id: string }>>;
      };
      const ordered = await matching.workers(jobId, [poster.id], [skill.id]);
      expect(ordered.map((worker) => worker.id)).toEqual([
        near,
        middle,
        far,
        unknown,
      ]);
    });
  });
});

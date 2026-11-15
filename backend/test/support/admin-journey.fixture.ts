/**
 * Data for the admin console journey against a real local backend
 * (admin/tests/real). Creates a poster and one published, open job with a
 * unique title, and prints {"jobTitle": "..."} on stdout. Local and CI test
 * databases only.
 */
import { randomUUID } from "node:crypto";
import {
  JobActorType,
  JobStatus,
  PrismaClient,
  RoleMode,
} from "@prisma/client";

if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test")
  throw new Error(
    "The admin journey fixture runs only with NODE_ENV=development or test.",
  );

async function main() {
  const prisma = new PrismaClient();
  try {
    const [category, location] = await Promise.all([
      prisma.category.findFirstOrThrow({ where: { is_active: true } }),
      prisma.location.findFirstOrThrow({ where: { is_active: true } }),
    ]);
    const run = randomUUID().slice(0, 8);
    const poster = await prisma.user.create({
      data: {
        phone_e164: `+88010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        role_modes: [RoleMode.CUSTOMER],
        active_role: RoleMode.CUSTOMER,
        profile: { create: { display_name: `Journey poster ${run}` } },
      },
    });
    const jobTitle = `Admin journey job ${run}`;
    const startsAt = new Date(Date.now() + 5 * 86_400_000);
    const job = await prisma.job.create({
      data: {
        poster_user_id: poster.id,
        title: jobTitle,
        description: "A synthetic job for the admin console journey test.",
        category_id: category.id,
        location_id: location.id,
        job_type: "ONE_TIME",
        payment_model: "FIXED",
        status: JobStatus.APPLICATIONS_OPEN,
        published_at: new Date(),
        starts_at: startsAt,
        ends_at: new Date(startsAt.getTime() + 3_600_000),
      },
    });
    await prisma.jobStatusHistory.createMany({
      data: [
        {
          job_id: job.id,
          from_status: null,
          to_status: JobStatus.DRAFT,
          actor_type: JobActorType.POSTER,
          actor_user_id: poster.id,
        },
        {
          job_id: job.id,
          from_status: JobStatus.DRAFT,
          to_status: JobStatus.APPLICATIONS_OPEN,
          actor_type: JobActorType.SYSTEM,
        },
      ],
    });
    process.stdout.write(JSON.stringify({ jobTitle }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RoleMode, UserStatus } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { STORAGE_PORT, StoragePort } from "../../infra/storage/storage.port";
import { createPublicProfileProjection } from "./public-profile.projection";

const workerPublicSelect = {
  id: true,
  profile: {
    select: {
      display_name: true,
      photo_key: true,
      lat: true,
      lng: true,
      trust_level: true,
      primary_location: { select: { name_en: true, name_bn: true } },
    },
  },
  worker_profile: {
    select: {
      rating_avg: true,
      rating_count: true,
      completed_jobs_count: true,
    },
  },
  skills: {
    select: {
      level: true,
      is_verified: true,
      skill: { select: { id: true, name_en: true, name_bn: true } },
    },
  },
  availability_rules: {
    where: { is_active: true },
    select: { start_time: true },
  },
  badges: {
    where: { revoked_at: null },
    select: { badge: { select: { slug: true, name_bn: true, icon: true } } },
  },
} satisfies Prisma.UserSelect;

type PublicWorkerRecord = Prisma.UserGetPayload<{
  select: typeof workerPublicSelect;
}>;

@Injectable()
export class PublicProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async getWorkerProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        deleted_at: null,
        role_modes: { has: RoleMode.WORKER },
      },
      select: workerPublicSelect,
    });
    if (!user?.profile || !user.worker_profile) throw new NotFoundException();

    return this.project(user);
  }

  async listWorkers(skillId?: string, locationId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        deleted_at: null,
        role_modes: { has: RoleMode.WORKER },
        worker_profile: { isNot: null },
        profile: locationId
          ? { is: { primary_location_id: locationId } }
          : { isNot: null },
        skills: skillId ? { some: { skill_id: skillId } } : undefined,
      },
      select: workerPublicSelect,
      orderBy: { worker_profile: { rating_avg: "desc" } },
      take: 50,
    });
    const items = await Promise.all(
      users
        .filter(
          (
            user,
          ): user is PublicWorkerRecord & {
            profile: NonNullable<PublicWorkerRecord["profile"]>;
            worker_profile: NonNullable<PublicWorkerRecord["worker_profile"]>;
          } => Boolean(user.profile && user.worker_profile),
        )
        .map((user) => this.project(user)),
    );
    return { items };
  }

  private async project(user: PublicWorkerRecord) {
    if (!user.profile || !user.worker_profile) throw new NotFoundException();
    const photoUrl = user.profile.photo_key
      ? (
          await this.storage.createDownloadUrl({
            key: user.profile.photo_key,
            expiresInSeconds: 5 * 60,
          })
        ).downloadUrl
      : null;
    return {
      ...createPublicProfileProjection({
        id: user.id,
        displayName: user.profile.display_name,
        photoUrl,
        area: user.profile.primary_location
          ? {
              nameEn: user.profile.primary_location.name_en,
              nameBn: user.profile.primary_location.name_bn,
            }
          : null,
        latitude: user.profile.lat?.toNumber() ?? null,
        longitude: user.profile.lng?.toNumber() ?? null,
        trustLevel: user.profile.trust_level,
        ratingAverage: user.worker_profile.rating_avg.toString(),
        ratingCount: user.worker_profile.rating_count,
        completedJobsCount: user.worker_profile.completed_jobs_count,
        skills: user.skills.map((item) => ({
          id: item.skill.id,
          nameEn: item.skill.name_en,
          nameBn: item.skill.name_bn,
          level: item.level,
          isVerified: item.is_verified,
        })),
        availabilityStartMinutes: user.availability_rules.map(
          (rule) =>
            rule.start_time.getUTCHours() * 60 +
            rule.start_time.getUTCMinutes(),
        ),
      }),
      badges: (user.badges ?? []).map(({ badge }) => ({
        slug: badge.slug,
        nameBn: badge.name_bn,
        icon: badge.icon,
      })),
    };
  }
}

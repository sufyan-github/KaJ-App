import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  MentorStatus,
  PhotoVisibility,
  Prisma,
  RoleMode,
  UserStatus,
} from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { STORAGE_PORT, StoragePort } from "../../infra/storage/storage.port";
import { EngagementService } from "../safety/engagement.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { TrainingCertificatesService } from "../training/training-certificates.service";
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
      photo_visibility: true,
      show_full_name: true,
      hide_precise_area: true,
      discoverable: true,
      mentor_status: true,
      mentor_accepting: true,
      mentor_bio: true,
      mentor_years_experience: true,
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
      can_mentor: true,
      skill: { select: { id: true, name_en: true, name_bn: true } },
    },
  },
  availability_rules: {
    where: { is_active: true },
    select: { start_time: true },
  },
  badges: {
    where: { revoked_at: null },
    select: {
      badge: {
        select: { slug: true, name_en: true, name_bn: true, icon: true },
      },
    },
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
    @Optional() private readonly certificates?: TrainingCertificatesService,
    @Optional() private readonly userBlocks?: UserBlocksService,
    @Optional() private readonly engagementService?: EngagementService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  private get engagement() {
    return this.engagementService ?? new EngagementService(this.prisma);
  }

  /** `viewerUserId`: the signed-in viewer, when the request carried a token. */
  async getWorkerProfile(userId: string, viewerUserId?: string) {
    if (viewerUserId && (await this.blocks.between(viewerUserId, userId)))
      throw new NotFoundException();
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        deleted_at: null,
        // W5: workers, and approved mentors who are not workers.
        OR: [
          { role_modes: { has: RoleMode.WORKER } },
          {
            role_modes: { has: RoleMode.MENTOR },
            profile: { mentor_status: MentorStatus.APPROVED },
          },
        ],
      },
      select: workerPublicSelect,
    });
    if (!user?.profile) throw new NotFoundException();
    // A worker who left the directory is still visible to people they are
    // already dealing with (an applicant's poster opens it from the list).
    const engaged =
      viewerUserId !== undefined &&
      (viewerUserId === userId ||
        (await this.engagement.engaged(viewerUserId, userId)));
    if (user.profile.discoverable === false && !engaged)
      throw new NotFoundException();
    const hired =
      viewerUserId !== undefined &&
      user.profile.photo_visibility === PhotoVisibility.AFTER_HIRE &&
      (viewerUserId === userId ||
        (await this.engagement.hired(viewerUserId, userId)));

    const [projection, trainings] = await Promise.all([
      this.project(user, hired),
      this.certificates?.publicTrainings(user.id) ?? [],
    ]);
    return { ...projection, trainings };
  }

  async listWorkers(
    skillId?: string,
    locationId?: string,
    viewerUserId?: string,
  ) {
    const hidden = viewerUserId
      ? [viewerUserId, ...(await this.blocks.hiddenFrom(viewerUserId))]
      : [];
    const users = await this.prisma.user.findMany({
      where: {
        id: hidden.length ? { notIn: hidden } : undefined,
        status: UserStatus.ACTIVE,
        deleted_at: null,
        role_modes: { has: RoleMode.WORKER },
        worker_profile: { isNot: null },
        // People who turned "discoverable" off are not listed.
        profile: {
          is: {
            discoverable: true,
            ...(locationId ? { primary_location_id: locationId } : {}),
          },
        },
        skills: skillId ? { some: { skill_id: skillId } } : undefined,
      },
      select: workerPublicSelect,
      orderBy: { worker_profile: { rating_avg: "desc" } },
      take: 50,
    });
    const hiredByViewer = viewerUserId
      ? await this.engagement.hiredWorkers(
          viewerUserId,
          users
            .filter(
              (user) =>
                user.profile?.photo_visibility === PhotoVisibility.AFTER_HIRE,
            )
            .map((user) => user.id),
        )
      : new Set<string>();
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
        .map((user) => this.project(user, hiredByViewer.has(user.id))),
    );
    return { items };
  }

  /** `hiredByViewer`: the viewer has a hire with this worker (photo rule). */
  private async project(user: PublicWorkerRecord, hiredByViewer = false) {
    if (!user.profile) throw new NotFoundException();
    // A mentor who is not a worker has no work record yet (W5).
    const work = user.worker_profile;
    const visibility =
      user.profile.photo_visibility ?? PhotoVisibility.EVERYONE;
    const photoAllowed =
      visibility === PhotoVisibility.EVERYONE ||
      (visibility === PhotoVisibility.AFTER_HIRE && hiredByViewer);
    const photoUrl =
      user.profile.photo_key && photoAllowed
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
        ratingAverage: work?.rating_avg.toString() ?? "0",
        ratingCount: work?.rating_count ?? 0,
        completedJobsCount: work?.completed_jobs_count ?? 0,
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
        privacy: {
          showFullName: user.profile.show_full_name,
          hidePreciseArea: user.profile.hide_precise_area,
        },
      }),
      // Approved mentors also show what they teach (P1.1).
      mentor:
        user.profile.mentor_status === MentorStatus.APPROVED
          ? {
              accepting: user.profile.mentor_accepting,
              bio: user.profile.mentor_bio,
              yearsExperience: user.profile.mentor_years_experience,
              skillIds: user.skills
                .filter((item) => item.can_mentor)
                .map((item) => item.skill.id),
            }
          : null,
      badges: (user.badges ?? []).map(({ badge }) => ({
        slug: badge.slug,
        nameEn: badge.name_en,
        nameBn: badge.name_bn,
        icon: badge.icon,
      })),
    };
  }
}

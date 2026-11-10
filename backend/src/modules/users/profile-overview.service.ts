import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { TrustLevel } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { STORAGE_PORT, StoragePort } from "../../infra/storage/storage.port";
import { TrainingCertificatesService } from "../training/training-certificates.service";
import { profileCompleteness } from "./profile-completeness";

@Injectable()
export class ProfileOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly certificates: TrainingCertificatesService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async get(userId: string) {
    const [user, certificates] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, deleted_at: null },
        select: {
          role_modes: true,
          active_role: true,
          profile: {
            select: {
              display_name: true,
              bio: true,
              gender: true,
              birth_year: true,
              photo_key: true,
              trust_level: true,
              primary_location: {
                select: { id: true, name_en: true, name_bn: true },
              },
            },
          },
          skills: {
            orderBy: { created_at: "asc" },
            select: {
              level: true,
              years: true,
              has_prior_training: true,
              skill: {
                select: { id: true, slug: true, name_en: true, name_bn: true },
              },
            },
          },
        },
      }),
      this.certificates.validFor(userId),
    ]);
    if (!user) throw new NotFoundException();
    const profile = user.profile;
    const photoUrl = profile?.photo_key
      ? (
          await this.storage.createDownloadUrl({
            key: profile.photo_key,
            expiresInSeconds: 5 * 60,
          })
        ).downloadUrl
      : null;
    const trustLevel = profile?.trust_level ?? TrustLevel.NONE;
    return {
      displayName: profile?.display_name ?? "",
      bio: profile?.bio ?? null,
      gender: profile?.gender ?? null,
      birthYear: profile?.birth_year ?? null,
      primaryLocation: profile?.primary_location
        ? {
            id: profile.primary_location.id,
            nameEn: profile.primary_location.name_en,
            nameBn: profile.primary_location.name_bn,
          }
        : null,
      photoUrl,
      trustLevel,
      roles: user.role_modes,
      activeRole: user.active_role,
      skills: user.skills.map((row) => ({
        skillId: row.skill.id,
        slug: row.skill.slug,
        nameEn: row.skill.name_en,
        nameBn: row.skill.name_bn,
        level: row.level,
        years: row.years?.toString() ?? null,
        hasPriorTraining: row.has_prior_training,
      })),
      certificates,
      completeness: profileCompleteness({
        activeRole: user.active_role,
        hasPhoto: Boolean(profile?.photo_key),
        hasBio: Boolean(profile?.bio?.trim()),
        hasArea: Boolean(profile?.primary_location),
        skillCount: user.skills.length,
        trustLevel,
        validCertificateCount: certificates.length,
      }),
    };
  }
}

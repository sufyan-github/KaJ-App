import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RoleMode } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { activateRoleMode } from "./role-modes";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateWorkerProfileDto } from "./dto/update-worker-profile.dto";
import { WorkerSkillInputDto } from "./dto/update-worker-skills.dto";
import { validateWorkerSkillIds } from "./worker-skills.rules";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async activateRole(userId: string, role: RoleMode) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.user.findUnique({
        where: { id: userId },
        select: {
          default_locale: true,
          profile: { select: { display_name: true } },
          role_modes: true,
        },
      });
      if (!current) throw new NotFoundException();

      const roles = activateRoleMode(current.role_modes, role);
      await transaction.user.update({
        where: { id: userId },
        data: { active_role: role, role_modes: roles },
      });
      await transaction.profile.upsert({
        where: { user_id: userId },
        update: {},
        create: {
          user_id: userId,
          display_name: "",
          locale: current.default_locale,
          trust_level: "PHONE",
        },
      });
      if (role === RoleMode.WORKER) {
        await transaction.workerProfile.upsert({
          where: { user_id: userId },
          update: {},
          create: { user_id: userId },
        });
      } else {
        await transaction.customerProfile.upsert({
          where: { user_id: userId },
          update: {},
          create: { user_id: userId },
        });
      }

      return {
        activeRole: role,
        roles,
        home: role === RoleMode.WORKER ? "worker" : "customer",
        onboardingRequired: !(current.profile?.display_name ?? "").trim(),
      };
    });
  }

  async updateProfile(userId: string, input: UpdateProfileDto) {
    const profile = await this.prisma.profile.upsert({
      where: { user_id: userId },
      update: {
        display_name: input.displayName.trim(),
        bio: input.bio?.trim(),
        gender: input.gender,
        birth_year: input.birthYear,
        primary_location_id: input.primaryLocationId,
        lat: input.latitude,
        lng: input.longitude,
      },
      create: {
        user_id: userId,
        display_name: input.displayName.trim(),
        bio: input.bio?.trim(),
        gender: input.gender,
        birth_year: input.birthYear,
        primary_location_id: input.primaryLocationId,
        lat: input.latitude,
        lng: input.longitude,
        trust_level: "PHONE",
      },
    });
    return {
      id: profile.id,
      displayName: profile.display_name,
      bio: profile.bio,
      gender: profile.gender,
      birthYear: profile.birth_year,
      primaryLocationId: profile.primary_location_id,
      latitude: profile.lat?.toString() ?? null,
      longitude: profile.lng?.toString() ?? null,
      trustLevel: profile.trust_level,
    };
  }

  async getWorkerSkills(userId: string) {
    return this.loadWorkerSkills(userId);
  }

  async updateWorkerSkills(userId: string, inputs: WorkerSkillInputDto[]) {
    try {
      validateWorkerSkillIds(inputs.map((input) => input.skillId));
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    await this.prisma.$transaction(async (transaction) => {
      const skillIds = inputs.map((input) => input.skillId);
      const activeSkills = await transaction.skill.count({
        where: { id: { in: skillIds }, is_active: true },
      });
      if (activeSkills !== skillIds.length) {
        throw new BadRequestException("Every skill must be active and known.");
      }
      await transaction.userSkill.deleteMany({ where: { user_id: userId } });
      if (inputs.length > 0) {
        await transaction.userSkill.createMany({
          data: inputs.map((input) => ({
            user_id: userId,
            skill_id: input.skillId,
            level: input.level,
            years: input.years,
          })),
        });
      }
    });
    return this.loadWorkerSkills(userId);
  }

  async updateWorkerRates(userId: string, input: UpdateWorkerProfileDto) {
    const profile = await this.prisma.workerProfile.upsert({
      where: { user_id: userId },
      update: {
        hourly_rate_poisha: input.hourlyRatePoisha,
        daily_rate_poisha: input.dailyRatePoisha,
        monthly_rate_poisha: input.monthlyRatePoisha,
      },
      create: {
        user_id: userId,
        hourly_rate_poisha: input.hourlyRatePoisha,
        daily_rate_poisha: input.dailyRatePoisha,
        monthly_rate_poisha: input.monthlyRatePoisha,
      },
    });
    return {
      hourlyRatePoisha: profile.hourly_rate_poisha?.toString() ?? null,
      dailyRatePoisha: profile.daily_rate_poisha?.toString() ?? null,
      monthlyRatePoisha: profile.monthly_rate_poisha?.toString() ?? null,
    };
  }

  async favorites(userId: string) {
    const rows = await this.prisma.favorite.findMany({
      where: { user_id: userId },
      include: { target: { include: { profile: true, worker_profile: true } } },
      orderBy: { created_at: "desc" },
    });
    return {
      items: rows.map((row) => ({
        userId: row.target_user_id,
        displayName: row.target.profile?.display_name || "কর্মী",
        ratingAverage: row.target.worker_profile?.rating_avg.toString() ?? "0",
        savedAt: row.created_at.toISOString(),
      })),
    };
  }

  async saveFavorite(userId: string, workerId: string) {
    if (userId === workerId)
      throw new BadRequestException("Cannot save yourself.");
    const worker = await this.prisma.user.findFirst({
      where: {
        id: workerId,
        worker_profile: { isNot: null },
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!worker) throw new NotFoundException();
    await this.prisma.favorite.upsert({
      where: {
        user_id_target_user_id: { user_id: userId, target_user_id: workerId },
      },
      update: {},
      create: { user_id: userId, target_user_id: workerId },
    });
    return { saved: true, workerId };
  }

  async removeFavorite(userId: string, workerId: string) {
    await this.prisma.favorite.deleteMany({
      where: { user_id: userId, target_user_id: workerId },
    });
    return { saved: false, workerId };
  }

  private async loadWorkerSkills(userId: string) {
    const rows = await this.prisma.userSkill.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "asc" },
      include: {
        skill: {
          select: { id: true, slug: true, name_en: true, name_bn: true },
        },
      },
    });
    return rows.map((row) => ({
      skillId: row.skill.id,
      slug: row.skill.slug,
      nameEn: row.skill.name_en,
      nameBn: row.skill.name_bn,
      level: row.level,
      years: row.years?.toString() ?? null,
      isVerified: row.is_verified,
    }));
  }
}

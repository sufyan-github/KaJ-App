import { Injectable } from "@nestjs/common";
import { LocationType } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";
import { buildCategoryTree } from "./catalog.tree";
import {
  CreateLocationDto,
  UpdateCategoryDto,
  UpdateLocationDto,
  UpdateSkillDto,
} from "./dto/catalog-admin.dto";
import {
  CategoryNode,
  CategoryRecord,
  LocationRecord,
  SkillRecord,
} from "./catalog.types";

const CACHE_TTL_SECONDS = 60 * 60;
const CACHE_PREFIX = "catalog:v1:";

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getCategories(
    tree: boolean,
  ): Promise<CategoryRecord[] | CategoryNode[]> {
    const records = await this.cached("categories", async () => {
      const rows = await this.prisma.category.findMany({
        where: { is_active: true },
        orderBy: [{ sort_order: "asc" }, { name_en: "asc" }],
        select: {
          id: true,
          parent_id: true,
          slug: true,
          name_en: true,
          name_bn: true,
          icon: true,
          sort_order: true,
        },
      });
      return rows.map((row) => ({
        id: row.id,
        parentId: row.parent_id,
        slug: row.slug,
        nameEn: row.name_en,
        nameBn: row.name_bn,
        icon: row.icon,
        sortOrder: row.sort_order,
      }));
    });
    return tree ? buildCategoryTree(records) : records;
  }

  async getSkills(categoryId?: string, query?: string): Promise<SkillRecord[]> {
    const normalizedQuery = query?.trim();
    if (normalizedQuery) {
      return this.loadSkills(categoryId, normalizedQuery);
    }
    return this.cached(`skills:${categoryId ?? "all"}`, () =>
      this.loadSkills(categoryId),
    );
  }

  async getLocations(
    parentId?: string,
    type?: LocationType,
  ): Promise<LocationRecord[]> {
    return this.cached(
      `locations:${parentId ?? "root"}:${type ?? "all"}`,
      async () => {
        const rows = await this.prisma.location.findMany({
          where: {
            is_active: true,
            parent_id: parentId === undefined ? null : parentId,
            type,
          },
          orderBy: { name_en: "asc" },
          select: {
            id: true,
            parent_id: true,
            type: true,
            name_en: true,
            name_bn: true,
            lat: true,
            lng: true,
            radius_km: true,
          },
        });
        return rows.map((row) => ({
          id: row.id,
          parentId: row.parent_id,
          type: row.type,
          nameEn: row.name_en,
          nameBn: row.name_bn,
          lat: row.lat?.toString() ?? null,
          lng: row.lng?.toString() ?? null,
          radiusKm: row.radius_km?.toString() ?? null,
        }));
      },
    );
  }

  async invalidateCache(): Promise<void> {
    const client = this.redis.getClient();
    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          "MATCH",
          `${CACHE_PREFIX}*`,
          "COUNT",
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) await client.del(...keys);
      } while (cursor !== "0");
    } catch {
      // A failed cache cannot make a committed admin mutation fail.
    }
  }

  async updateCategory(id: string, input: UpdateCategoryDto) {
    const result = await this.prisma.category.update({
      where: { id },
      data: {
        name_en: input.nameEn,
        name_bn: input.nameBn,
        icon: input.icon,
        sort_order: input.sortOrder,
        is_active: input.isActive,
      },
    });
    await this.invalidateCache();
    return result;
  }

  async updateSkill(id: string, input: UpdateSkillDto) {
    const result = await this.prisma.skill.update({
      where: { id },
      data: {
        name_en: input.nameEn,
        name_bn: input.nameBn,
        category_id: input.categoryId,
        is_active: input.isActive,
      },
    });
    await this.invalidateCache();
    return result;
  }

  async createLocation(input: CreateLocationDto) {
    const result = await this.prisma.location.create({
      data: {
        parent_id: input.parentId,
        type: input.type,
        name_en: input.nameEn,
        name_bn: input.nameBn,
      },
    });
    await this.invalidateCache();
    return result;
  }

  async updateLocation(id: string, input: UpdateLocationDto) {
    const result = await this.prisma.location.update({
      where: { id },
      data: {
        name_en: input.nameEn,
        name_bn: input.nameBn,
        is_active: input.isActive,
      },
    });
    await this.invalidateCache();
    return result;
  }

  private async loadSkills(
    categoryId?: string,
    query?: string,
  ): Promise<SkillRecord[]> {
    const rows = await this.prisma.skill.findMany({
      where: {
        is_active: true,
        category_id: categoryId,
        ...(query
          ? {
              OR: [
                { name_en: { contains: query, mode: "insensitive" } },
                { name_bn: { contains: query, mode: "insensitive" } },
                { slug: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name_en: "asc" },
      select: {
        id: true,
        slug: true,
        name_en: true,
        name_bn: true,
        category_id: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      nameEn: row.name_en,
      nameBn: row.name_bn,
      categoryId: row.category_id,
    }));
  }

  private async cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const client = this.redis.getClient();
    const cacheKey = `${CACHE_PREFIX}${key}`;
    try {
      const hit = await client.get(cacheKey);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch {
      // Catalog reads fail open when Redis is unavailable.
    }
    const value = await loader();
    try {
      await client.set(
        cacheKey,
        JSON.stringify(value),
        "EX",
        CACHE_TTL_SECONDS,
      );
    } catch {
      // Database results remain usable when Redis is unavailable.
    }
    return value;
  }
}

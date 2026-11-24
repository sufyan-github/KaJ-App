import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BusinessCategory, Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import { audit } from "../learning/learning-admin.service";
import { BusinessCategoryDto } from "./dto/business-admin.dto";

function serializeCategory(row: BusinessCategory) {
  return {
    id: row.id,
    parentId: row.parent_id,
    slug: row.slug,
    nameEn: row.name_en,
    nameBn: row.name_bn,
    icon: row.icon,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Admin operations for KAAJ Business; every change is audit-logged. */
@Injectable()
export class BusinessAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** The whole sector taxonomy, inactive sectors included. */
  async categories() {
    const rows = await this.prisma.businessCategory.findMany({
      orderBy: [{ sort_order: "asc" }, { slug: "asc" }],
    });
    return { items: rows.map(serializeCategory) };
  }

  async saveCategory(
    id: string | null,
    input: BusinessCategoryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const before = id
      ? await this.prisma.businessCategory.findUnique({ where: { id } })
      : null;
    if (id && !before) throw new NotFoundException();
    if (input.parentId) {
      if (input.parentId === id)
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "A sector can't be its own parent.",
          messageKey: "error.validation.failed",
          field: "parentId",
        });
      const parent = await this.prisma.businessCategory.findUnique({
        where: { id: input.parentId },
        select: { parent_id: true },
      });
      // Two levels: sector → sub-sector.
      if (!parent || parent.parent_id)
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "The parent must be a top-level sector.",
          messageKey: "error.validation.failed",
          field: "parentId",
        });
    }
    const data = {
      parent_id: input.parentId ?? null,
      slug: input.slug,
      name_en: input.nameEn.trim(),
      name_bn: input.nameBn.trim(),
      icon: input.icon?.trim() || null,
      sort_order: input.sortOrder ?? before?.sort_order ?? 0,
      is_active: input.isActive ?? before?.is_active ?? true,
    } satisfies Prisma.BusinessCategoryUncheckedCreateInput;
    const saved = await (
      id
        ? this.prisma.businessCategory.update({ where: { id }, data })
        : this.prisma.businessCategory.create({ data })
    ).catch((error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException({
          code: "BUSINESS_CATEGORY_SLUG_TAKEN",
          message: "A sector with this slug already exists.",
          messageKey: "error.business.category_slug_taken",
          field: "slug",
        });
      throw error;
    });
    await this.prisma.auditLog.create({
      data: audit(
        actor,
        context,
        id
          ? "ADMIN_BUSINESS_CATEGORY_UPDATED"
          : "ADMIN_BUSINESS_CATEGORY_CREATED",
        "BUSINESS_CATEGORY",
        saved.id,
        before ? serializeCategory(before) : null,
        { ...serializeCategory(saved), reason: input.reason },
      ),
    });
    return serializeCategory(saved);
  }
}

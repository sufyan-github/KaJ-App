import { Injectable } from "@nestjs/common";
import { BusinessOffering, Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { businessErrors } from "./business.errors";
import { BusinessesService } from "./businesses.service";
import { CreateOfferingDto, UpdateOfferingDto } from "./dto/offering.dto";

const MAX_OFFERINGS = 100;

/** An offering anyone may see on a visible business. */
export const PUBLIC_OFFERING = {
  is_active: true,
  hidden_at: null,
  deleted_at: null,
} as const satisfies Prisma.BusinessOfferingWhereInput;

/**
 * P2.2: what a business offers (products and services), with a bn/en title
 * and an optional price range. Members see every offering; others only the
 * active, unhidden ones of a business they may see.
 */
@Injectable()
export class BusinessOfferingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
  ) {}

  async list(viewerUserId: string, businessId: string) {
    // 404 unless the viewer may see the business at all.
    const business = await this.businesses.get(viewerUserId, businessId);
    const member = business.myRole !== null;
    const rows = await this.prisma.businessOffering.findMany({
      where: {
        business_profile_id: businessId,
        deleted_at: null,
        ...(member ? {} : PUBLIC_OFFERING),
      },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
    });
    return { items: rows.map((row) => serializeOffering(row, member)) };
  }

  async create(userId: string, businessId: string, input: CreateOfferingDto) {
    await this.businesses.assertEditable(businessId);
    const titles = titlesOf(input);
    if (!titles.title_en && !titles.title_bn)
      throw businessErrors.offeringTitleRequired();
    const prices = pricesOf(input);
    const count = await this.prisma.businessOffering.count({
      where: { business_profile_id: businessId, deleted_at: null },
    });
    if (count >= MAX_OFFERINGS) throw businessErrors.offeringLimit();
    const row = await this.prisma.businessOffering.create({
      data: {
        business_profile_id: businessId,
        kind: input.kind,
        ...titles,
        description: input.description?.trim() || null,
        ...prices,
        price_unit: input.priceUnit?.trim() || null,
        is_active: input.isActive ?? true,
        sort_order: input.sortOrder ?? count,
      },
    });
    await this.audit(userId, "BUSINESS_OFFERING_CREATED", row.id, businessId);
    return serializeOffering(row, true);
  }

  async update(
    userId: string,
    businessId: string,
    offeringId: string,
    input: UpdateOfferingDto,
  ) {
    await this.businesses.assertEditable(businessId);
    const current = await this.owned(businessId, offeringId);
    const next = {
      title_en:
        input.titleEn === undefined
          ? current.title_en
          : input.titleEn?.trim() || null,
      title_bn:
        input.titleBn === undefined
          ? current.title_bn
          : input.titleBn?.trim() || null,
    };
    if (!next.title_en && !next.title_bn)
      throw businessErrors.offeringTitleRequired();
    const prices = pricesOf({
      priceMinPoisha:
        input.priceMinPoisha === undefined
          ? current.price_min_poisha?.toString()
          : input.priceMinPoisha,
      priceMaxPoisha:
        input.priceMaxPoisha === undefined
          ? current.price_max_poisha?.toString()
          : input.priceMaxPoisha,
    });
    const row = await this.prisma.businessOffering.update({
      where: { id: offeringId },
      data: {
        kind: input.kind,
        ...next,
        description:
          input.description === undefined
            ? undefined
            : input.description?.trim() || null,
        ...prices,
        price_unit:
          input.priceUnit === undefined
            ? undefined
            : input.priceUnit?.trim() || null,
        is_active: input.isActive,
        sort_order: input.sortOrder,
      },
    });
    await this.audit(userId, "BUSINESS_OFFERING_UPDATED", row.id, businessId);
    return serializeOffering(row, true);
  }

  async remove(userId: string, businessId: string, offeringId: string) {
    await this.owned(businessId, offeringId);
    await this.prisma.businessOffering.update({
      where: { id: offeringId },
      data: { deleted_at: new Date(), is_active: false },
    });
    await this.audit(
      userId,
      "BUSINESS_OFFERING_DELETED",
      offeringId,
      businessId,
    );
    return { id: offeringId, deleted: true };
  }

  private async owned(businessId: string, offeringId: string) {
    const row = await this.prisma.businessOffering.findFirst({
      where: {
        id: offeringId,
        business_profile_id: businessId,
        deleted_at: null,
      },
    });
    if (!row) throw businessErrors.notFound();
    return row;
  }

  private audit(
    userId: string,
    action: string,
    offeringId: string,
    businessId: string,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actor_user_id: userId,
        action,
        entity: "BusinessOffering",
        entity_id: offeringId,
        after_json: { businessId },
      },
    });
  }
}

function titlesOf(input: { titleEn?: string | null; titleBn?: string | null }) {
  return {
    title_en: input.titleEn?.trim() || null,
    title_bn: input.titleBn?.trim() || null,
  };
}

function pricesOf(input: {
  priceMinPoisha?: string | null;
  priceMaxPoisha?: string | null;
}) {
  const min = input.priceMinPoisha ? BigInt(input.priceMinPoisha) : null;
  const max = input.priceMaxPoisha ? BigInt(input.priceMaxPoisha) : null;
  if (min !== null && max !== null && min > max)
    throw businessErrors.offeringPriceInvalid();
  return { price_min_poisha: min, price_max_poisha: max };
}

export function serializeOffering(row: BusinessOffering, member: boolean) {
  return {
    id: row.id,
    businessId: row.business_profile_id,
    kind: row.kind,
    titleEn: row.title_en,
    titleBn: row.title_bn,
    description: row.description,
    priceMinPoisha: row.price_min_poisha?.toString() ?? null,
    priceMaxPoisha: row.price_max_poisha?.toString() ?? null,
    priceUnit: row.price_unit,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(member
      ? {
          status: row.hidden_at
            ? "HIDDEN"
            : row.is_active
              ? "ACTIVE"
              : "INACTIVE",
          hiddenReason: row.hidden_reason,
        }
      : {}),
  };
}

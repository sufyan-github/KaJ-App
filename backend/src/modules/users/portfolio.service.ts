import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { STORAGE_PORT, StoragePort } from "../../infra/storage/storage.port";
import { CreatePortfolioItemDto } from "./dto/create-portfolio-item.dto";

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async list(userId: string) {
    const items = await this.prisma.portfolioItem.findMany({
      where: { user_id: userId, document: { deleted_at: null } },
      include: { document: true, category: true },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });
    return {
      items: await Promise.all(items.map((item) => this.serialize(item))),
    };
  }

  async create(userId: string, input: CreatePortfolioItemDto) {
    const [count, document, category] = await Promise.all([
      this.prisma.portfolioItem.count({ where: { user_id: userId } }),
      this.prisma.document.findFirst({
        where: {
          id: input.documentId,
          user_id: userId,
          kind: "PORTFOLIO_IMAGE",
          is_sensitive: false,
          deleted_at: null,
          portfolio_item: null,
        },
      }),
      this.prisma.category.findFirst({
        where: { id: input.categoryId, is_active: true },
      }),
    ]);
    if (count >= 20)
      throw new ConflictException("A portfolio can contain at most 20 items.");
    if (!document)
      throw new BadRequestException("Portfolio image is unavailable.");
    if (!category)
      throw new BadRequestException("Portfolio category is unavailable.");
    const item = await this.prisma.portfolioItem.create({
      data: {
        user_id: userId,
        document_id: document.id,
        category_id: category.id,
        caption: input.caption?.trim() || null,
        sort_order: count,
      },
      include: { document: true, category: true },
    });
    return this.serialize(item);
  }

  async remove(userId: string, id: string) {
    const item = await this.prisma.portfolioItem.findFirst({
      where: { id, user_id: userId },
      include: { document: true },
    });
    if (!item) throw new NotFoundException();
    await this.storage.deleteObject(item.document.storage_key);
    await this.prisma.$transaction([
      this.prisma.portfolioItem.delete({ where: { id } }),
      this.prisma.document.update({
        where: { id: item.document_id },
        data: { deleted_at: new Date() },
      }),
    ]);
    return { deleted: true, id };
  }

  private async serialize(item: {
    id: string;
    caption: string | null;
    sort_order: number;
    created_at: Date;
    document: { storage_key: string };
    category: { id: string; name_en: string; name_bn: string };
  }) {
    const signed = await this.storage.createDownloadUrl({
      key: item.document.storage_key,
      expiresInSeconds: 5 * 60,
    });
    return {
      id: item.id,
      imageUrl: signed.downloadUrl,
      caption: item.caption,
      sortOrder: item.sort_order,
      category: {
        id: item.category.id,
        nameEn: item.category.name_en,
        nameBn: item.category.name_bn,
      },
      createdAt: item.created_at.toISOString(),
    };
  }
}

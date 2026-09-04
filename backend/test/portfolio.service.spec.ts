import { PrismaService } from "../src/infra/prisma/prisma.service";
import {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  StoragePort,
  WriteObjectInput,
} from "../src/infra/storage/storage.port";
import { PortfolioService } from "../src/modules/users/portfolio.service";

describe("PortfolioService", () => {
  const userId = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f701";
  const count = jest.fn();
  const create = jest.fn();
  const findMany = jest.fn();
  const findItem = jest.fn();
  const updateItem = jest.fn();
  const findDocument = jest.fn();
  const findCategory = jest.fn();
  const prisma = {
    $transaction: jest.fn((operations) => Promise.all(operations)),
    portfolioItem: {
      count,
      create,
      findMany,
      findFirst: findItem,
      update: updateItem,
    },
    document: { findFirst: findDocument },
    category: { findFirst: findCategory },
  } as unknown as PrismaService;
  let storage: TestStorage;
  let service: PortfolioService;

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new TestStorage();
    service = new PortfolioService(prisma, storage);
    count.mockResolvedValue(0);
    findDocument.mockResolvedValue({ id: "document-id" });
    findCategory.mockResolvedValue({ id: "category-id" });
    create.mockResolvedValue(item());
    findItem.mockResolvedValue(item());
    updateItem.mockResolvedValue(item());
  });

  it("accepts only an unused owner portfolio document and active category", async () => {
    const result = await service.create(userId, {
      documentId: "document-id",
      categoryId: "category-id",
      caption: "  নিরাপদ বৈদ্যুতিক কাজ  ",
    });

    expect(findDocument).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "document-id",
        user_id: userId,
        kind: "PORTFOLIO_IMAGE",
        is_sensitive: false,
        portfolio_item: null,
      }),
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ caption: "নিরাপদ বৈদ্যুতিক কাজ" }),
      include: { document: true, category: true },
    });
    expect(result.imageUrl).toContain("signed.test");
  });

  it("enforces the 20 item limit", async () => {
    count.mockResolvedValue(20);
    await expect(
      service.create(userId, {
        documentId: "document-id",
        categoryId: "category-id",
      }),
    ).rejects.toThrow("at most 20 items");
    expect(create).not.toHaveBeenCalled();
  });

  it("returns items in stable display order with expiring image URLs", async () => {
    findMany.mockResolvedValue([item()]);
    const result = await service.list(userId);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "portfolio-id",
      caption: "নিরাপদ বৈদ্যুতিক কাজ",
    });
  });

  it("updates the caption and category only for an owned item", async () => {
    await service.update(userId, "portfolio-id", {
      categoryId: "category-id",
      caption: "  নতুন ক্যাপশন  ",
    });

    expect(findItem).toHaveBeenCalledWith({
      where: { id: "portfolio-id", user_id: userId },
    });
    expect(updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "portfolio-id" },
        data: {
          category_id: "category-id",
          caption: "নতুন ক্যাপশন",
        },
      }),
    );
  });

  it("reorders only when every owned item is present exactly once", async () => {
    findMany.mockResolvedValue([{ id: "first" }, { id: "second" }]);
    updateItem.mockResolvedValue({});

    await service.reorder(userId, ["second", "first"]);

    expect(updateItem).toHaveBeenNthCalledWith(1, {
      where: { id: "second" },
      data: { sort_order: 0 },
    });
    expect(updateItem).toHaveBeenNthCalledWith(2, {
      where: { id: "first" },
      data: { sort_order: 1 },
    });
  });

  it("rejects a partial reorder", async () => {
    findMany.mockResolvedValue([{ id: "first" }, { id: "second" }]);

    await expect(service.reorder(userId, ["first"])).rejects.toThrow(
      "every portfolio item",
    );
    expect(updateItem).not.toHaveBeenCalled();
  });
});

function item() {
  return {
    id: "portfolio-id",
    caption: "নিরাপদ বৈদ্যুতিক কাজ",
    sort_order: 0,
    created_at: new Date("2026-09-05T00:00:00Z"),
    document: { storage_key: "portfolio/user/image.webp" },
    category: {
      id: "category-id",
      name_en: "Electrical",
      name_bn: "বৈদ্যুতিক",
    },
  };
}

class TestStorage implements StoragePort {
  createDownloadUrl(input: CreateDownloadUrlInput) {
    return Promise.resolve({
      key: input.key,
      downloadUrl: `https://signed.test/${input.key}`,
      expiresAt: new Date("2026-09-05T00:05:00Z"),
    });
  }
  createUploadUrl(_input: CreateUploadUrlInput): Promise<never> {
    throw new Error("not used");
  }
  deleteObject(_key: string): Promise<void> {
    return Promise.resolve();
  }
  getObjectMetadata(_key: string): Promise<never> {
    throw new Error("not used");
  }
  readObject(_key: string): Promise<never> {
    throw new Error("not used");
  }
  writeObject(_input: WriteObjectInput): Promise<void> {
    return Promise.resolve();
  }
}

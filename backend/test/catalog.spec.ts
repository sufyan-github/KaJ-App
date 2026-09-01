import { LocationType } from "@prisma/client";

import { PrismaService } from "../src/infra/prisma/prisma.service";
import { RedisService } from "../src/infra/redis/redis.service";
import { CatalogService } from "../src/modules/catalog/catalog.service";
import { buildCategoryTree } from "../src/modules/catalog/catalog.tree";
import { CategoryRecord } from "../src/modules/catalog/catalog.types";

const category = (
  id: string,
  parentId: string | null,
  sortOrder = 0,
): CategoryRecord => ({
  id,
  parentId,
  slug: id,
  nameEn: id,
  nameBn: `bn-${id}`,
  icon: null,
  sortOrder,
});

describe("catalog tree integrity", () => {
  it("builds and sorts a two-level bilingual tree", () => {
    const tree = buildCategoryTree([
      category("child-b", "root", 2),
      category("root", null),
      category("child-a", "root", 1),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.children.map((item) => item.id)).toEqual([
      "child-a",
      "child-b",
    ]);
  });

  it("rejects cycles, missing parents, excessive depth, and missing names", () => {
    expect(() =>
      buildCategoryTree([category("a", "b"), category("b", "a")]),
    ).toThrow("cycle");
    expect(() => buildCategoryTree([category("a", "missing")])).toThrow(
      "unknown parent",
    );
    expect(() =>
      buildCategoryTree([
        category("root", null),
        category("child", "root"),
        category("grandchild", "child"),
      ]),
    ).toThrow("maximum depth");
    expect(() =>
      buildCategoryTree([{ ...category("a", null), nameBn: "" }]),
    ).toThrow("bilingual name");
  });
});

describe("CatalogService", () => {
  const categoryFindMany = jest.fn();
  const categoryUpdate = jest.fn();
  const skillFindMany = jest.fn();
  const locationFindMany = jest.fn();
  const locationCreate = jest.fn();
  const get = jest.fn();
  const set = jest.fn();
  const scan = jest.fn();
  const del = jest.fn();
  const redisClient = { get, set, scan, del };
  const prisma = {
    category: { findMany: categoryFindMany, update: categoryUpdate },
    skill: { findMany: skillFindMany },
    location: { create: locationCreate, findMany: locationFindMany },
  } as unknown as PrismaService;
  const redis = {
    getClient: () => redisClient,
  } as unknown as RedisService;
  const service = new CatalogService(prisma, redis);

  beforeEach(() => {
    jest.clearAllMocks();
    get.mockResolvedValue(null);
    set.mockResolvedValue("OK");
  });

  it("loads only active categories and writes the one-hour cache", async () => {
    categoryFindMany.mockResolvedValue([
      {
        id: "category-id",
        parent_id: null,
        slug: "home",
        name_en: "Home",
        name_bn: "বাসা",
        icon: "home",
        sort_order: 1,
      },
    ]);

    await expect(service.getCategories(false)).resolves.toEqual([
      expect.objectContaining({ id: "category-id", nameBn: "বাসা" }),
    ]);
    expect(categoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_active: true } }),
    );
    expect(set).toHaveBeenCalledWith(
      "catalog:v1:categories",
      expect.any(String),
      "EX",
      3600,
    );
  });

  it("serves a cache hit without querying Prisma", async () => {
    get.mockResolvedValue(
      JSON.stringify([
        {
          id: "skill-id",
          slug: "cleaning",
          nameEn: "Cleaning",
          nameBn: "পরিষ্কার",
          categoryId: "category-id",
        },
      ]),
    );

    const result = await service.getSkills("category-id");

    expect(result).toHaveLength(1);
    expect(skillFindMany).not.toHaveBeenCalled();
  });

  it("filters location reads to active nodes at one requested tree level", async () => {
    locationFindMany.mockResolvedValue([]);

    await service.getLocations("city-id", LocationType.THANA);

    expect(locationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          is_active: true,
          parent_id: "city-id",
          type: LocationType.THANA,
        },
      }),
    );
  });

  it("invalidates every paginated catalog cache key", async () => {
    scan
      .mockResolvedValueOnce(["7", ["catalog:v1:categories"]])
      .mockResolvedValueOnce(["0", ["catalog:v1:locations:root:all"]]);

    await service.invalidateCache();

    expect(scan).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenNthCalledWith(1, "catalog:v1:categories");
    expect(del).toHaveBeenNthCalledWith(2, "catalog:v1:locations:root:all");
  });

  it("invalidates cached reads after an administrator adds an area", async () => {
    locationCreate.mockResolvedValue({ id: "area-id" });
    scan.mockResolvedValue(["0", ["catalog:v1:locations:thana-id:AREA"]]);

    await service.createLocation({
      parentId: "01991a2b-3c4d-7000-8000-000000000001",
      type: LocationType.AREA,
      nameEn: "New Area",
      nameBn: "নতুন এলাকা",
    });

    expect(locationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ name_en: "New Area" }),
    });
    expect(del).toHaveBeenCalledWith("catalog:v1:locations:thana-id:AREA");
  });
});

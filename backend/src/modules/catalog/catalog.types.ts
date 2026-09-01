export interface CategoryRecord {
  id: string;
  parentId: string | null;
  slug: string;
  nameEn: string;
  nameBn: string;
  icon: string | null;
  sortOrder: number;
}

export interface CategoryNode extends CategoryRecord {
  children: CategoryNode[];
}

export interface SkillRecord {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string;
  categoryId: string;
}

export interface LocationRecord {
  id: string;
  parentId: string | null;
  type: "CITY" | "THANA" | "AREA";
  nameEn: string;
  nameBn: string;
  lat: string | null;
  lng: string | null;
  radiusKm: string | null;
}

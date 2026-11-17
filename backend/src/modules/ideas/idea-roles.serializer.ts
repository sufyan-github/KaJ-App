import { IdeaRoleType, Prisma } from "@prisma/client";

/** How each role reads in the app. */
export const ROLE_LABEL: Record<IdeaRoleType, { en: string; bn: string }> = {
  CO_FOUNDER: { en: "Co-founder", bn: "সহ-প্রতিষ্ঠাতা" },
  TECHNICAL: { en: "Technical partner", bn: "কারিগরি অংশীদার" },
  MARKETING: { en: "Marketing partner", bn: "বিপণন অংশীদার" },
  OPERATIONS: { en: "Operations partner", bn: "পরিচালনা অংশীদার" },
  INDUSTRY_EXPERT: { en: "Industry expert", bn: "শিল্প বিশেষজ্ঞ" },
  MENTOR: { en: "Mentor", bn: "মেন্টর" },
  SUPPLIER: { en: "Supplier", bn: "সরবরাহকারী" },
  DISTRIBUTION: { en: "Distribution partner", bn: "বিতরণ অংশীদার" },
  PRODUCTION: { en: "Production partner", bn: "উৎপাদন অংশীদার" },
  RESEARCH: { en: "Research collaborator", bn: "গবেষণা সহযোগী" },
};

export const roleInclude = {
  skills: {
    include: { skill: { select: { id: true, name_en: true, name_bn: true } } },
  },
} satisfies Prisma.IdeaRoleInclude;

export type RoleRow = Prisma.IdeaRoleGetPayload<{
  include: typeof roleInclude;
}>;

export function serializeRole(role: RoleRow) {
  return {
    id: role.id,
    roleType: role.role_type,
    roleLabel: ROLE_LABEL[role.role_type],
    title: role.title,
    description: role.description,
    timeCommitment: role.time_commitment,
    arrangement: role.arrangement,
    status: role.status,
    skills: role.skills.map(({ skill }) => ({
      id: skill.id,
      nameEn: skill.name_en,
      nameBn: skill.name_bn,
    })),
  };
}

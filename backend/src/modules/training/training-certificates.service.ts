import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { maskPublicDisplayName } from "../users/public-profile.projection";
import { normalizeCertificateCode } from "./training.rules";

export const certificateInclude = {
  course: {
    select: {
      id: true,
      title_en: true,
      title_bn: true,
      is_safety_critical: true,
      skill: { select: { id: true, slug: true, name_en: true, name_bn: true } },
    },
  },
} satisfies Prisma.TrainingCertificateInclude;

export type CertificateRecord = Prisma.TrainingCertificateGetPayload<{
  include: typeof certificateInclude;
}>;

export function serializeSkillRef(
  skill: { id: string; slug: string; name_en: string; name_bn: string } | null,
) {
  return skill
    ? {
        id: skill.id,
        slug: skill.slug,
        nameEn: skill.name_en,
        nameBn: skill.name_bn,
      }
    : null;
}

export function serializeCertificate(certificate: CertificateRecord) {
  return {
    id: certificate.id,
    code: certificate.public_code,
    courseId: certificate.course.id,
    courseTitleEn: certificate.course.title_en,
    courseTitleBn: certificate.course.title_bn,
    skill: serializeSkillRef(certificate.course.skill),
    evidenceLevel: certificate.evidence_level,
    scorePct: certificate.score_pct,
    issuedAt: certificate.issued_at.toISOString(),
    status: certificate.revoked_at ? "REVOKED" : "VALID",
    isSafetyCritical: certificate.course.is_safety_critical,
    verifyPath: `/api/v1/certificates/${certificate.public_code}`,
  };
}

export type CertificateSummary = ReturnType<typeof serializeCertificate>;

@Injectable()
export class TrainingCertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string) {
    const items = await this.prisma.trainingCertificate.findMany({
      where: { user_id: userId },
      include: certificateInclude,
      orderBy: [{ issued_at: "desc" }, { id: "desc" }],
    });
    return { items: items.map(serializeCertificate) };
  }

  /** Valid (not revoked) certificates, newest first. */
  async validFor(userId: string): Promise<CertificateSummary[]> {
    const items = await this.prisma.trainingCertificate.findMany({
      where: { user_id: userId, revoked_at: null },
      include: certificateInclude,
      orderBy: [{ issued_at: "desc" }, { id: "desc" }],
    });
    return items.map(serializeCertificate);
  }

  async publicTrainings(userId: string) {
    const items = await this.prisma.trainingCertificate.findMany({
      where: { user_id: userId, revoked_at: null },
      include: certificateInclude,
      orderBy: [{ issued_at: "desc" }, { id: "desc" }],
    });
    return items.map((item) => ({
      courseTitleEn: item.course.title_en,
      courseTitleBn: item.course.title_bn,
      skillSlug: item.course.skill?.slug ?? null,
      evidenceLevel: item.evidence_level,
      issuedAt: item.issued_at.toISOString(),
      isSafetyCritical: item.course.is_safety_critical,
    }));
  }

  /** Public lookup: never returns phone, NID, photo or the full name. */
  async verify(rawCode: string) {
    const code = normalizeCertificateCode(rawCode);
    if (!code) throw new NotFoundException();
    const certificate = await this.prisma.trainingCertificate.findFirst({
      where: {
        public_code: code,
        user: {
          deleted_at: null,
          status: { not: UserStatus.PENDING_DELETION },
        },
      },
      select: {
        public_code: true,
        evidence_level: true,
        issued_at: true,
        revoked_at: true,
        course: {
          select: {
            title_en: true,
            title_bn: true,
            is_safety_critical: true,
          },
        },
        user: { select: { profile: { select: { display_name: true } } } },
      },
    });
    if (!certificate) throw new NotFoundException();
    return {
      code: certificate.public_code,
      holderName: maskPublicDisplayName(
        certificate.user.profile?.display_name ?? "",
      ),
      courseTitleEn: certificate.course.title_en,
      courseTitleBn: certificate.course.title_bn,
      evidenceLevel: certificate.evidence_level,
      isSafetyCritical: certificate.course.is_safety_critical,
      issuedAt: certificate.issued_at.toISOString(),
      status: certificate.revoked_at ? "REVOKED" : "VALID",
    };
  }
}

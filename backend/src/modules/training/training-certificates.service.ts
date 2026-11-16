import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  maskPublicDisplayName,
  visibleDisplayName,
} from "../users/public-profile.projection";
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
  skill: { select: { id: true, slug: true, name_en: true, name_bn: true } },
  issued_by: {
    select: {
      id: true,
      profile: { select: { display_name: true, show_full_name: true } },
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

/** QUIZ (a passed KAAJ course test) or PRACTICAL (checked by a mentor). */
export function certificateKind(certificate: { assignment_id: string | null }) {
  return certificate.assignment_id ? "PRACTICAL" : "QUIZ";
}

export function serializeCertificate(certificate: CertificateRecord) {
  const course = certificate.course;
  return {
    id: certificate.id,
    kind: certificateKind(certificate),
    code: certificate.public_code,
    courseId: course?.id ?? null,
    // For a practical record both titles are the opportunity's title.
    courseTitleEn: course?.title_en ?? certificate.title,
    courseTitleBn: course?.title_bn ?? certificate.title,
    title: certificate.title ?? course?.title_en ?? null,
    skill: serializeSkillRef(certificate.skill ?? course?.skill ?? null),
    evidenceLevel: certificate.evidence_level,
    scorePct: certificate.score_pct,
    issuedAt: certificate.issued_at.toISOString(),
    issuedBy: certificate.issued_by
      ? {
          userId: certificate.issued_by.id,
          displayName: visibleDisplayName(
            certificate.issued_by.profile?.display_name ?? "",
            {
              showFullName:
                certificate.issued_by.profile?.show_full_name ?? false,
              hired: false,
            },
          ),
        }
      : null,
    status: certificate.revoked_at ? "REVOKED" : "VALID",
    isSafetyCritical: course?.is_safety_critical ?? false,
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
      kind: certificateKind(item),
      courseTitleEn: item.course?.title_en ?? item.title,
      courseTitleBn: item.course?.title_bn ?? item.title,
      skillSlug: item.skill?.slug ?? item.course?.skill?.slug ?? null,
      evidenceLevel: item.evidence_level,
      issuedAt: item.issued_at.toISOString(),
      isSafetyCritical: item.course?.is_safety_critical ?? false,
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
        assignment_id: true,
        title: true,
        skill: { select: { name_en: true, name_bn: true } },
        issued_by: { select: { profile: { select: { display_name: true } } } },
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
      kind: certificateKind(certificate),
      holderName: maskPublicDisplayName(
        certificate.user.profile?.display_name ?? "",
      ),
      courseTitleEn: certificate.course?.title_en ?? certificate.title,
      courseTitleBn: certificate.course?.title_bn ?? certificate.title,
      skill: certificate.skill
        ? {
            nameEn: certificate.skill.name_en,
            nameBn: certificate.skill.name_bn,
          }
        : null,
      // Who checked a practical record (masked, never contact details).
      issuedByName: certificate.issued_by
        ? maskPublicDisplayName(
            certificate.issued_by.profile?.display_name ?? "",
          )
        : null,
      evidenceLevel: certificate.evidence_level,
      isSafetyCritical: certificate.course?.is_safety_critical ?? false,
      issuedAt: certificate.issued_at.toISOString(),
      status: certificate.revoked_at ? "REVOKED" : "VALID",
    };
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import { NotificationsService } from "../notifications/notifications.service";
import {
  AdminCertificateQueryDto,
  AdminReasonDto,
} from "./dto/learning-admin.dto";

/** Admin operations for KAAJ Learn; every change is audit-logged. */
@Injectable()
export class LearningAdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async certificates(query: AdminCertificateQueryDto) {
    const limit = query.limit ?? 50;
    const search = query.search?.trim();
    const where: Prisma.TrainingCertificateWhereInput = {
      ...(query.kind === "PRACTICAL" ? { assignment_id: { not: null } } : {}),
      ...(query.kind === "QUIZ" ? { attempt_id: { not: null } } : {}),
      ...(search
        ? {
            OR: [
              { public_code: { contains: search.toUpperCase() } },
              {
                user: {
                  profile: {
                    display_name: { contains: search, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.trainingCertificate.findMany({
      where,
      include: {
        course: { select: { title_en: true, title_bn: true } },
        user: {
          select: { id: true, profile: { select: { display_name: true } } },
        },
        issued_by: {
          select: { id: true, profile: { select: { display_name: true } } },
        },
      },
      orderBy: [{ issued_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((row) => ({
        id: row.id,
        kind: row.assignment_id ? "PRACTICAL" : "QUIZ",
        code: row.public_code,
        title: row.title ?? row.course?.title_en ?? null,
        holder: {
          userId: row.user.id,
          name: row.user.profile?.display_name ?? "Unknown",
        },
        issuedBy: row.issued_by
          ? {
              userId: row.issued_by.id,
              name: row.issued_by.profile?.display_name ?? "Unknown",
            }
          : null,
        evidenceLevel: row.evidence_level,
        issuedAt: row.issued_at.toISOString(),
        status: row.revoked_at ? "REVOKED" : "VALID",
        revokedReason: row.revoked_reason,
      })),
    };
  }

  async revokeCertificate(
    id: string,
    input: AdminReasonDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const certificate = await this.prisma.trainingCertificate.findUnique({
      where: { id },
    });
    if (!certificate) throw new NotFoundException();
    if (certificate.revoked_at)
      throw new ConflictException("This record is already revoked.");
    const now = new Date();
    const reason = input.reason.trim();
    await this.prisma.$transaction([
      this.prisma.trainingCertificate.update({
        where: { id },
        data: { revoked_at: now, revoked_reason: reason },
      }),
      this.prisma.auditLog.create({
        data: audit(
          actor,
          context,
          "ADMIN_CERTIFICATE_REVOKED",
          "CERTIFICATE",
          id,
          {
            status: "VALID",
          },
          { status: "REVOKED", reason },
        ),
      }),
    ]);
    await this.notifications?.create({
      userId: certificate.user_id,
      type: "CERTIFICATE_REVOKED",
      title: "সনদ বাতিল হয়েছে",
      body: "আপনার একটি সনদ KAAJ বাতিল করেছে। বিস্তারিত জানতে সহায়তায় যোগাযোগ করুন।",
      payload: { certificateId: id },
      dedupeKey: `certificate-revoked:${id}`,
    });
    return { id, status: "REVOKED", revokedAt: now.toISOString() };
  }
}

export function audit(
  actor: AdminActor,
  context: AdminRequestContext,
  action: string,
  entity: string,
  entityId: string | null,
  before: Prisma.InputJsonValue | null,
  after: Prisma.InputJsonValue | null,
): Prisma.AuditLogUncheckedCreateInput {
  return {
    actor_user_id: actor.userId,
    action,
    entity,
    entity_id: entityId,
    before_json: before ?? Prisma.JsonNull,
    after_json: after ?? Prisma.JsonNull,
    ip: context.ip,
    ua: context.ua,
  };
}

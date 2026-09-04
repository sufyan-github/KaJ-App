import { Inject, Injectable, ConflictException } from "@nestjs/common";
import {
  Prisma,
  TrustLevel,
  VerificationKind,
  VerificationStatus,
} from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { STORAGE_PORT, StoragePort } from "../../infra/storage/storage.port";
import { SubmitVerificationDto } from "./dto/verification.dto";
import { hasTrust, prerequisiteFor, trustForVerification } from "./trust-level";

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async submit(userId: string, input: SubmitVerificationDto) {
    if (input.kind === VerificationKind.PHONE)
      throw new ConflictException(
        "Phone trust is established through OTP authentication.",
      );
    const uniqueDocumentIds = [...new Set(input.documentIds)];
    if (uniqueDocumentIds.length !== input.documentIds.length)
      throw new ConflictException("Each verification document must be unique.");

    const [profile, user] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { user_id: userId },
        select: { trust_level: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { reverification_required: true },
      }),
    ]);
    const currentTrust = profile?.trust_level ?? TrustLevel.NONE;
    const required = prerequisiteFor(input.kind);
    if (!hasTrust(currentTrust, required))
      throw new ConflictException(
        `${required} verification is required before ${input.kind}.`,
      );
    if (
      user?.reverification_required &&
      input.kind !== VerificationKind.IDENTITY
    )
      throw new ConflictException(
        "Identity verification is required to restore marketplace access.",
      );
    if (
      !user?.reverification_required &&
      hasTrust(currentTrust, trustForVerification(input.kind))
    )
      throw new ConflictException(
        `${input.kind} verification is already active.`,
      );

    const [existing, documents] = await Promise.all([
      this.prisma.verificationRequest.findFirst({
        where: {
          user_id: userId,
          kind: input.kind,
          status: VerificationStatus.PENDING,
        },
      }),
      this.prisma.document.findMany({
        where: {
          id: { in: uniqueDocumentIds },
          user_id: userId,
          kind: "VERIFICATION_DOCUMENT",
          is_sensitive: true,
          deleted_at: null,
          verification_links: { none: {} },
        },
      }),
    ]);
    if (existing)
      throw new ConflictException("A verification request is already pending.");
    if (documents.length !== uniqueDocumentIds.length)
      throw new ConflictException(
        "Every document must be an unused private verification document owned by you.",
      );

    const request = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.verificationRequest.create({
        data: {
          user_id: userId,
          kind: input.kind,
          status: VerificationStatus.PENDING,
          documents_json: { documentIds: uniqueDocumentIds },
          documents: {
            create: uniqueDocumentIds.map((documentId) => ({
              document_id: documentId,
            })),
          },
        },
      });
      await transaction.auditLog.create({
        data: {
          actor_user_id: userId,
          action: "VERIFICATION_SUBMITTED",
          entity: "VERIFICATION",
          entity_id: created.id,
          before_json: Prisma.JsonNull,
          after_json: {
            kind: input.kind,
            documentCount: uniqueDocumentIds.length,
            status: VerificationStatus.PENDING,
          },
        },
      });
      await transaction.notification.create({
        data: {
          user_id: userId,
          type: "VERIFICATION_SUBMITTED",
          title_key: "verification.submitted.title",
          body_key: "verification.submitted.body",
          payload_json: { requestId: created.id, kind: input.kind },
        },
      });
      return created;
    });
    return serializeRequest(request, uniqueDocumentIds);
  }

  async mine(userId: string) {
    const items = await this.prisma.verificationRequest.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      include: {
        documents: {
          include: {
            document: { select: { id: true, kind: true, deleted_at: true } },
          },
        },
      },
    });
    return {
      items: items.map((item) => ({
        ...serializeRequest(
          item,
          item.documents
            .filter((link) => link.document.deleted_at === null)
            .map((link) => link.document.id),
        ),
        documentsPurged:
          item.documents.length > 0 &&
          item.documents.every((link) => link.purged_at),
      })),
    };
  }

  async purgeExpiredDocuments(limit = 100) {
    const now = this.clock.now();
    const links = await this.prisma.verificationDocument.findMany({
      where: {
        purge_after: { lte: now },
        purged_at: null,
        document: { deleted_at: null },
      },
      orderBy: { purge_after: "asc" },
      take: limit,
      include: { document: true },
    });
    let purged = 0;
    for (const link of links) {
      await this.storage.deleteObject(link.document.storage_key);
      await this.prisma.$transaction([
        this.prisma.document.update({
          where: { id: link.document_id },
          data: { deleted_at: now },
        }),
        this.prisma.verificationDocument.update({
          where: {
            verification_request_id_document_id: {
              verification_request_id: link.verification_request_id,
              document_id: link.document_id,
            },
          },
          data: { purged_at: now },
        }),
        this.prisma.auditLog.create({
          data: {
            action: "VERIFICATION_DOCUMENT_PURGED",
            entity: "DOCUMENT",
            entity_id: link.document_id,
            before_json: { storageKeyPresent: true },
            after_json: { deletedAt: now.toISOString() },
          },
        }),
      ]);
      purged += 1;
    }
    return { purged };
  }
}

function serializeRequest(
  request: {
    id: string;
    kind: VerificationKind;
    status: VerificationStatus;
    rejection_reason: string | null;
    reviewed_at: Date | null;
    created_at: Date;
  },
  documentIds: string[],
) {
  return {
    id: request.id,
    kind: request.kind,
    status: request.status,
    documentIds,
    rejectionReason: request.rejection_reason,
    reviewedAt: request.reviewed_at?.toISOString() ?? null,
    createdAt: request.created_at.toISOString(),
  };
}

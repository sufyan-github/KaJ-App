import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  AdminRole,
  DisputeAppealStatus,
  DisputeStatus,
  JobActorType,
  JobStatus,
  Prisma,
} from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { STORAGE_PORT, StoragePort } from "../../infra/storage/storage.port";
import { NotificationsService } from "../notifications/notifications.service";
import {
  AddDisputeEvidenceDto,
  AppealDisputeDto,
  OpenDisputeDto,
} from "./dto/disputes.dto";

const ELIGIBLE_STATUSES: JobStatus[] = [
  JobStatus.SUBMITTED,
  JobStatus.CUSTOMER_REVIEW,
  JobStatus.COMPLETED,
];
const DAY_MS = 24 * 60 * 60_000;

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async open(userId: string, assignmentId: string, input: OpenDisputeDto) {
    const now = this.clock.now();
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        contracts: { orderBy: { version: "desc" }, take: 1 },
        work_sessions: true,
        job: {
          include: {
            conversations: {
              include: {
                messages: {
                  orderBy: { created_at: "asc" },
                  select: {
                    sender_user_id: true,
                    type: true,
                    body: true,
                    attachment_key: true,
                    created_at: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!assignment || !isParty(assignment, userId))
      throw new NotFoundException();
    if (!ELIGIBLE_STATUSES.includes(assignment.job.status))
      throw new ConflictException(
        "This assignment is not eligible for dispute.",
      );
    const windowStart =
      assignment.job.completed_at ??
      assignment.submitted_at ??
      assignment.job.updated_at;
    if (now.getTime() > windowStart.getTime() + 7 * DAY_MS)
      throw new ConflictException("The seven-day dispute window has closed.");

    const otherUserId =
      userId === assignment.worker_user_id
        ? assignment.job.poster_user_id
        : assignment.worker_user_id;
    const evidence = autoEvidence(assignment);
    const dispute = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.dispute.findUnique({
        where: { assignment_id: assignmentId },
      });
      if (existing)
        throw new ConflictException("This assignment already has a dispute.");
      const created = await transaction.dispute.create({
        data: {
          job_id: assignment.job_id,
          assignment_id: assignmentId,
          opened_by_user_id: userId,
          reason_code: input.reasonCode,
          description: input.description,
          status: DisputeStatus.EVIDENCE,
          evidence_due_at: new Date(now.getTime() + 48 * 60 * 60_000),
          resolution_due_at: new Date(now.getTime() + 72 * 60 * 60_000),
          evidence: {
            create: evidence.map((item) => ({ ...item, user_id: userId })),
          },
        },
      });
      await transaction.job.update({
        where: { id: assignment.job_id },
        data: { status: JobStatus.DISPUTED },
      });
      await transaction.jobStatusHistory.create({
        data: {
          job_id: assignment.job_id,
          from_status: assignment.job.status,
          to_status: JobStatus.DISPUTED,
          actor_user_id: userId,
          actor_type:
            userId === assignment.worker_user_id
              ? JobActorType.WORKER
              : JobActorType.POSTER,
          reason: input.reasonCode,
        },
      });
      await transaction.payment.updateMany({
        where: { assignment_id: assignmentId },
        data: { frozen_at: now, freeze_reason: `DISPUTE:${created.id}` },
      });
      await transaction.auditLog.create({
        data: {
          actor_user_id: userId,
          action: "DISPUTE_OPENED",
          entity: "DISPUTE",
          entity_id: created.id,
          before_json: { jobStatus: assignment.job.status },
          after_json: {
            jobStatus: JobStatus.DISPUTED,
            reasonCode: input.reasonCode,
            evidenceDueAt: created.evidence_due_at.toISOString(),
          },
        },
      });
      return created;
    });
    await Promise.all(
      [userId, otherUserId].map((recipient) =>
        this.notifications.create({
          userId: recipient,
          type: "DISPUTE_OPENED",
          title: "dispute.opened.title",
          body: "dispute.opened.body",
          payload: { disputeId: dispute.id, route: "/disputes" },
          dedupeKey: `dispute:${dispute.id}:opened`,
        }),
      ),
    );
    return serializeDispute(dispute);
  }

  async mine(userId: string) {
    const items = await this.prisma.dispute.findMany({
      where: {
        OR: [
          { assignment: { worker_user_id: userId } },
          { job: { poster_user_id: userId } },
        ],
      },
      orderBy: { created_at: "desc" },
      include: { job: { select: { title: true } }, appeal: true },
    });
    return { items: items.map(serializeDispute) };
  }

  async detail(userId: string, id: string) {
    const dispute = await this.partyDispute(userId, id);
    return {
      ...serializeDispute(dispute),
      evidence: dispute.evidence.map(serializeEvidence),
      appeal: dispute.appeal,
    };
  }

  async addEvidence(userId: string, id: string, input: AddDisputeEvidenceDto) {
    const dispute = await this.partyDispute(userId, id);
    const now = this.clock.now();
    if (
      dispute.status !== DisputeStatus.EVIDENCE ||
      dispute.evidence_due_at <= now
    )
      throw new ConflictException("The evidence window has closed.");
    if (input.kind === "TEXT" && !input.text)
      throw new ConflictException("Text evidence requires a description.");
    if (input.kind !== "TEXT" && !input.documentId)
      throw new ConflictException("Attachment evidence requires a document.");
    const document = input.documentId
      ? await this.prisma.document.findFirst({
          where: {
            id: input.documentId,
            user_id: userId,
            kind: "DISPUTE_EVIDENCE",
            is_sensitive: true,
            deleted_at: null,
          },
        })
      : null;
    if (input.documentId && !document)
      throw new ConflictException("Evidence document is unavailable.");
    const evidence = await this.prisma.disputeEvidence.create({
      data: {
        dispute_id: id,
        user_id: userId,
        kind: input.kind,
        text: input.text,
        document_id: document?.id,
        storage_key: document?.storage_key,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actor_user_id: userId,
        action: "DISPUTE_EVIDENCE_ADDED",
        entity: "DISPUTE",
        entity_id: id,
        before_json: Prisma.JsonNull,
        after_json: { evidenceId: evidence.id, kind: evidence.kind },
      },
    });
    return serializeEvidence(evidence);
  }

  async downloadEvidence(userId: string, id: string, evidenceId: string) {
    await this.partyDispute(userId, id);
    const evidence = await this.prisma.disputeEvidence.findFirst({
      where: {
        id: evidenceId,
        dispute_id: id,
        document: { deleted_at: null },
      },
      include: { document: true },
    });
    if (!evidence?.document) throw new NotFoundException();
    const signed = await this.storage.createDownloadUrl({
      key: evidence.document.storage_key,
      expiresInSeconds: 60,
    });
    return { downloadUrl: signed.downloadUrl, expiresAt: signed.expiresAt };
  }

  async appeal(userId: string, id: string, input: AppealDisputeDto) {
    const dispute = await this.partyDispute(userId, id);
    const now = this.clock.now();
    if (dispute.appeal)
      throw new ConflictException("This dispute already has an appeal.");
    if (
      dispute.status !== DisputeStatus.RESOLVED ||
      !dispute.resolved_at ||
      now.getTime() > dispute.resolved_at.getTime() + 72 * 60 * 60_000
    )
      throw new ConflictException("The appeal window is unavailable.");
    const secondAdmin = await this.prisma.adminCredential.findFirst({
      where: {
        role: { in: [AdminRole.ADMIN, AdminRole.MODERATOR] },
        user_id: { not: dispute.resolved_by ?? undefined },
      },
      orderBy: { created_at: "asc" },
    });
    const appeal = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.disputeAppeal.create({
        data: {
          dispute_id: id,
          opened_by_user_id: userId,
          reason: input.reason,
          status: DisputeAppealStatus.PENDING,
          assigned_admin_id: secondAdmin?.user_id,
        },
      });
      await transaction.dispute.update({
        where: { id },
        data: { status: DisputeStatus.UNDER_REVIEW },
      });
      await transaction.job.update({
        where: { id: dispute.job_id },
        data: { status: JobStatus.DISPUTED },
      });
      await transaction.jobStatusHistory.create({
        data: {
          job_id: dispute.job_id,
          from_status: dispute.job.status,
          to_status: JobStatus.DISPUTED,
          actor_user_id: userId,
          actor_type:
            userId === dispute.assignment.worker_user_id
              ? JobActorType.WORKER
              : JobActorType.POSTER,
          reason: "Dispute appeal opened",
        },
      });
      await transaction.payment.updateMany({
        where: { assignment_id: dispute.assignment_id },
        data: { frozen_at: now, freeze_reason: `APPEAL:${created.id}` },
      });
      await transaction.auditLog.create({
        data: {
          actor_user_id: userId,
          action: "DISPUTE_APPEALED",
          entity: "DISPUTE",
          entity_id: id,
          before_json: { status: DisputeStatus.RESOLVED },
          after_json: {
            status: DisputeStatus.UNDER_REVIEW,
            appealId: created.id,
            assignedAdminId: created.assigned_admin_id,
          },
        },
      });
      return created;
    });
    return {
      id: appeal.id,
      status: appeal.status,
      assignedForSecondReview: appeal.assigned_admin_id !== null,
    };
  }

  async reconcileDueDisputes() {
    const now = this.clock.now();
    const result = await this.prisma.dispute.updateMany({
      where: { status: DisputeStatus.EVIDENCE, evidence_due_at: { lte: now } },
      data: { status: DisputeStatus.UNDER_REVIEW },
    });
    return { movedToReview: result.count };
  }

  private async partyDispute(userId: string, id: string) {
    const dispute = await this.prisma.dispute.findFirst({
      where: {
        id,
        OR: [
          { assignment: { worker_user_id: userId } },
          { job: { poster_user_id: userId } },
        ],
      },
      include: {
        evidence: { orderBy: { created_at: "asc" } },
        appeal: true,
        job: { select: { status: true, poster_user_id: true, title: true } },
        assignment: { select: { worker_user_id: true } },
      },
    });
    if (!dispute) throw new NotFoundException();
    return dispute;
  }
}

function isParty(
  assignment: { worker_user_id: string; job: { poster_user_id: string } },
  userId: string,
) {
  return (
    assignment.worker_user_id === userId ||
    assignment.job.poster_user_id === userId
  );
}

function autoEvidence(assignment: {
  contracts: Array<{ snapshot_json: Prisma.JsonValue }>;
  work_sessions: unknown[];
  job: { conversations: Array<{ messages: unknown[] }> };
}) {
  return [
    {
      kind: "SYSTEM_CONTRACT_SNAPSHOT",
      text: safeJson(assignment.contracts[0]?.snapshot_json ?? null),
    },
    {
      kind: "SYSTEM_CHAT_TRANSCRIPT",
      text: safeJson(
        assignment.job.conversations.flatMap((item) => item.messages),
      ),
    },
    {
      kind: "SYSTEM_CHECKIN_SNAPSHOT",
      text: safeJson(assignment.work_sessions),
    },
  ];
}

function safeJson(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}

function serializeDispute(dispute: {
  id: string;
  status: DisputeStatus;
  reason_code: string;
  description: string;
  evidence_due_at: Date;
  resolution_due_at: Date;
  decision: string | null;
  refund_poisha: bigint | null;
  release_poisha: bigint | null;
  resolved_at: Date | null;
  created_at: Date;
  job?: { title: string };
  appeal?: { status: DisputeAppealStatus } | null;
}) {
  return {
    id: dispute.id,
    status: dispute.status,
    reasonCode: dispute.reason_code,
    description: dispute.description,
    jobTitle: dispute.job?.title,
    evidenceDueAt: dispute.evidence_due_at.toISOString(),
    resolutionDueAt: dispute.resolution_due_at.toISOString(),
    decision: dispute.decision,
    refundPoisha: dispute.refund_poisha?.toString() ?? null,
    releasePoisha: dispute.release_poisha?.toString() ?? null,
    resolvedAt: dispute.resolved_at?.toISOString() ?? null,
    appealStatus: dispute.appeal?.status ?? null,
    createdAt: dispute.created_at.toISOString(),
  };
}

function serializeEvidence(evidence: {
  id: string;
  user_id: string;
  kind: string;
  text: string | null;
  document_id: string | null;
  created_at: Date;
}) {
  return {
    id: evidence.id,
    submittedBy: evidence.user_id,
    kind: evidence.kind,
    text: evidence.text,
    hasAttachment: evidence.document_id !== null,
    createdAt: evidence.created_at.toISOString(),
  };
}

import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import {
  AdminRole,
  ApplicationStatus,
  DisputeStatus,
  JobActorType,
  JobStatus,
  Prisma,
  TrustLevel,
  UserStatus,
  VerificationStatus,
} from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { STORAGE_PORT, StoragePort } from "../../infra/storage/storage.port";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import {
  ApplicationActionDto,
  CampaignDto,
  CategoryDto,
  ConfigChangeDto,
  DisputeResolutionDto,
  FeatureJobDto,
  FlagChangeDto,
  ForceTransitionDto,
  JobQueryDto,
  LocationDto,
  PageQueryDto,
  UserActionDto,
  UserQueryDto,
  VerificationDecisionDto,
  VerificationQueryDto,
} from "./dto/admin-ops.dto";

const TERMINAL_JOB_STATUSES: JobStatus[] = [
  JobStatus.REVIEWED,
  JobStatus.EXPIRED,
  JobStatus.CANCELLED_BY_CUSTOMER,
  JobStatus.CANCELLED_BY_WORKER,
];

@Injectable()
export class AdminOpsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async overview(actor: AdminActor, context: AdminRequestContext) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const stuckBefore = new Date(Date.now() - 2 * 60 * 60_000);
    const [
      users,
      jobs,
      todayJobs,
      openDisputes,
      pendingVerification,
      stuckJobs,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deleted_at: null } }),
      this.prisma.job.count({ where: { deleted_at: null } }),
      this.prisma.job.count({ where: { created_at: { gte: today } } }),
      this.prisma.dispute.count({
        where: {
          status: {
            in: [
              DisputeStatus.OPEN,
              DisputeStatus.EVIDENCE,
              DisputeStatus.UNDER_REVIEW,
            ],
          },
        },
      }),
      this.prisma.verificationRequest.count({
        where: { status: VerificationStatus.PENDING },
      }),
      this.prisma.job.findMany({
        where: {
          deleted_at: null,
          status: { notIn: TERMINAL_JOB_STATUSES },
          updated_at: { lt: stuckBefore },
        },
        orderBy: { updated_at: "asc" },
        take: 10,
        select: { id: true, title: true, status: true, updated_at: true },
      }),
    ]);
    await this.audit(
      actor,
      "ADMIN_DASHBOARD_VIEWED",
      "DASHBOARD",
      null,
      null,
      null,
      context,
    );
    return {
      counts: {
        users,
        jobs,
        todayJobs,
        openDisputes,
        pendingVerification,
        stuckJobs: stuckJobs.length,
      },
      stuckJobs,
    };
  }

  async users(
    query: UserQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const where: Prisma.UserWhereInput = {
      deleted_at: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: "insensitive" } },
              { phone_e164: { contains: query.search } },
              {
                profile: {
                  display_name: { contains: query.search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: query.limit,
        orderBy: { created_at: "desc" },
        include: { profile: true, admin_credential: true },
      }),
      this.prisma.user.count({ where }),
    ]);
    await this.audit(
      actor,
      "ADMIN_USERS_VIEWED",
      "USER",
      null,
      null,
      {
        filters: {
          limit: query.limit,
          search: query.search ?? null,
          status: query.status ?? null,
        },
      },
      context,
    );
    return {
      total,
      items: items.map((user) => ({
        id: user.id,
        name: user.profile?.display_name ?? "Profile incomplete",
        email: user.email,
        phone: user.phone_e164,
        status: user.status,
        roles: user.role_modes,
        trustLevel: user.profile?.trust_level ?? TrustLevel.NONE,
        adminRole: user.admin_credential?.role ?? null,
        createdAt: user.created_at,
      })),
    };
  }

  async userAction(
    id: string,
    input: UserActionDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    if (id === actor.userId)
      throw new ConflictException("Admins cannot moderate their own account.");
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { status: input.status },
      }),
      this.prisma.refreshToken.updateMany({
        where: { user_id: id, revoked_at: null },
        data: { revoked_at: now },
      }),
      this.prisma.adminSession.updateMany({
        where: { user_id: id, revoked_at: null },
        data: { revoked_at: now },
      }),
      this.prisma.moderationAction.create({
        data: {
          admin_user_id: actor.userId,
          target_type: "USER",
          target_id: id,
          action: input.status,
          reason: input.reason,
        },
      }),
      this.auditCreate(
        actor,
        "ADMIN_USER_STATUS_CHANGED",
        "USER",
        id,
        { status: user.status },
        { status: input.status, reason: input.reason },
        context,
      ),
    ]);
    return { id, status: input.status };
  }

  async resetUserSessions(
    id: string,
    reason: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const exists = await this.prisma.user.count({ where: { id } });
    if (!exists) throw new NotFoundException();
    const now = new Date();
    const [mobile, admin] = await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { user_id: id, revoked_at: null },
        data: { revoked_at: now },
      }),
      this.prisma.adminSession.updateMany({
        where: { user_id: id, revoked_at: null },
        data: { revoked_at: now },
      }),
      this.auditCreate(
        actor,
        "ADMIN_USER_SESSIONS_RESET",
        "USER",
        id,
        null,
        { reason },
        context,
      ),
    ]);
    return { id, revokedSessions: mobile.count + admin.count };
  }

  async impersonateReadOnly(
    id: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        posted_jobs: {
          take: 10,
          orderBy: { created_at: "desc" },
          select: { id: true, title: true, status: true },
        },
        applications: {
          take: 10,
          orderBy: { created_at: "desc" },
          select: { id: true, job_id: true, status: true },
        },
      },
    });
    if (!user) throw new NotFoundException();
    await this.audit(
      actor,
      "ADMIN_READ_ONLY_IMPERSONATION",
      "USER",
      id,
      null,
      { scope: "support-view" },
      context,
    );
    return {
      id: user.id,
      email: user.email,
      phone: user.phone_e164,
      status: user.status,
      profile: user.profile,
      postedJobs: user.posted_jobs,
      applications: user.applications,
    };
  }

  async jobs(
    query: JobQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const where: Prisma.JobWhereInput = {
      deleted_at: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: "insensitive" } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        take: query.limit,
        orderBy: { updated_at: "desc" },
        include: {
          poster: { include: { profile: true } },
          status_history: { orderBy: { created_at: "desc" }, take: 6 },
          _count: { select: { applications: true, assignments: true } },
        },
      }),
      this.prisma.job.count({ where }),
    ]);
    await this.audit(
      actor,
      "ADMIN_JOBS_VIEWED",
      "JOB",
      null,
      null,
      {
        filters: {
          limit: query.limit,
          search: query.search ?? null,
          status: query.status ?? null,
        },
      },
      context,
    );
    return { total, items: items.map(serializeJob) };
  }

  async forceTransition(
    id: string,
    input: ForceTransitionDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException();
    if (job.status === input.toStatus)
      throw new ConflictException("Job is already in that status.");
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.job.update({
        where: { id },
        data: { status: input.toStatus },
      });
      await transaction.jobStatusHistory.create({
        data: {
          job_id: id,
          from_status: job.status,
          to_status: input.toStatus,
          actor_user_id: actor.userId,
          actor_type: JobActorType.ADMIN,
          reason: input.reason,
        },
      });
      await transaction.moderationAction.create({
        data: {
          admin_user_id: actor.userId,
          target_type: "JOB",
          target_id: id,
          action: `FORCE_${input.toStatus}`,
          reason: input.reason,
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_JOB_FORCE_TRANSITIONED",
          "JOB",
          id,
          { status: job.status },
          { status: input.toStatus, reason: input.reason },
          context,
        ),
      });
      return result;
    });
    return { id: updated.id, status: updated.status };
  }

  async featureJob(
    id: string,
    input: FeatureJobDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.job.update({
        where: { id },
        data: { is_featured: input.isFeatured },
      }),
      this.prisma.moderationAction.create({
        data: {
          admin_user_id: actor.userId,
          target_type: "JOB",
          target_id: id,
          action: input.isFeatured ? "FEATURE" : "UNFEATURE",
          reason: input.reason,
        },
      }),
      this.auditCreate(
        actor,
        "ADMIN_JOB_FEATURE_CHANGED",
        "JOB",
        id,
        { isFeatured: job.is_featured },
        { isFeatured: input.isFeatured, reason: input.reason },
        context,
      ),
    ]);
    return { id, isFeatured: input.isFeatured };
  }

  async applications(
    query: PageQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const where: Prisma.ApplicationWhereInput = query.search
      ? {
          OR: [
            { job: { title: { contains: query.search, mode: "insensitive" } } },
            {
              worker: {
                profile: {
                  display_name: { contains: query.search, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : {};
    const items = await this.prisma.application.findMany({
      where,
      take: query.limit,
      orderBy: { created_at: "desc" },
      include: {
        job: { select: { id: true, title: true, status: true } },
        worker: { include: { profile: true } },
      },
    });
    await this.audit(
      actor,
      "ADMIN_APPLICATIONS_VIEWED",
      "APPLICATION",
      null,
      null,
      { filters: { limit: query.limit, search: query.search ?? null } },
      context,
    );
    return {
      items: items.map((item) => ({
        id: item.id,
        status: item.status,
        createdAt: item.created_at,
        job: item.job,
        worker: {
          id: item.worker_user_id,
          name: item.worker.profile?.display_name ?? "Unknown",
        },
      })),
    };
  }

  async unstickApplication(
    id: string,
    input: ApplicationActionDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const item = await this.prisma.application.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.application.update({
        where: { id },
        data: { status: input.status, responded_at: null, withdrawn_at: null },
      }),
      this.auditCreate(
        actor,
        "ADMIN_APPLICATION_UNSTUCK",
        "APPLICATION",
        id,
        { status: item.status },
        { status: input.status, reason: input.reason },
        context,
      ),
    ]);
    return { id, status: input.status };
  }

  async verifications(
    query: VerificationQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const where: Prisma.VerificationRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            user: {
              profile: {
                display_name: { contains: query.search, mode: "insensitive" },
              },
            },
          }
        : {}),
    };
    const items = await this.prisma.verificationRequest.findMany({
      where,
      take: query.limit,
      orderBy: { created_at: "asc" },
      include: {
        user: {
          include: {
            profile: true,
            documents: { where: { deleted_at: null } },
          },
        },
      },
    });
    await this.audit(
      actor,
      "ADMIN_VERIFICATION_QUEUE_VIEWED",
      "VERIFICATION",
      null,
      null,
      {
        filters: {
          limit: query.limit,
          search: query.search ?? null,
          status: query.status ?? null,
        },
      },
      context,
    );
    return {
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        status: item.status,
        createdAt: item.created_at,
        user: {
          id: item.user_id,
          name: item.user.profile?.display_name ?? "Unknown",
          trustLevel: item.user.profile?.trust_level ?? TrustLevel.NONE,
        },
        documents: item.user.documents.map((document) => ({
          id: document.id,
          kind: document.kind,
          mime: document.mime,
          sizeBytes: document.size_bytes.toString(),
        })),
      })),
    };
  }

  async verificationDocument(
    id: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const document = await this.prisma.document.findFirst({
      where: { id, deleted_at: null },
    });
    if (!document) throw new NotFoundException();
    const signed = await this.storage.createDownloadUrl({
      key: document.storage_key,
      expiresInSeconds: 60,
    });
    await this.audit(
      actor,
      "ADMIN_SENSITIVE_DOCUMENT_VIEWED",
      "DOCUMENT",
      id,
      null,
      { userId: document.user_id, watermark: actor.email },
      context,
    );
    return {
      documentId: id,
      mime: document.mime,
      downloadUrl: signed.downloadUrl,
      expiresAt: signed.expiresAt,
      watermark: `${actor.email} · ${new Date().toISOString()}`,
    };
  }

  async decideVerification(
    id: string,
    input: VerificationDecisionDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    if (
      input.status !== VerificationStatus.APPROVED &&
      input.status !== VerificationStatus.REJECTED
    )
      throw new ConflictException("Decision must approve or reject.");
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException();
    const trustLevel =
      input.status === VerificationStatus.APPROVED
        ? trustForKind(request.kind)
        : null;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.verificationRequest.update({
        where: { id },
        data: {
          status: input.status,
          reviewer_user_id: actor.userId,
          reviewed_at: new Date(),
          rejection_reason:
            input.status === VerificationStatus.REJECTED ? input.reason : null,
        },
      });
      if (trustLevel)
        await transaction.profile.update({
          where: { user_id: request.user_id },
          data: { trust_level: trustLevel },
        });
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_VERIFICATION_DECIDED",
          "VERIFICATION",
          id,
          { status: request.status },
          { status: input.status, trustLevel, reason: input.reason },
          context,
        ),
      });
    });
    return { id, status: input.status, trustLevel };
  }

  async categories(actor: AdminActor, context: AdminRequestContext) {
    const items = await this.prisma.category.findMany({
      orderBy: [{ parent_id: "asc" }, { sort_order: "asc" }],
    });
    await this.audit(
      actor,
      "ADMIN_CATEGORIES_VIEWED",
      "CATEGORY",
      null,
      null,
      null,
      context,
    );
    return { items: items.map(serializeCategory) };
  }

  async saveCategory(
    id: string | null,
    input: CategoryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const data = categoryData(input);
    const before = id
      ? await this.prisma.category.findUnique({ where: { id } })
      : null;
    if (id && !before) throw new NotFoundException();
    const saved = id
      ? await this.prisma.category.update({ where: { id }, data })
      : await this.prisma.category.create({ data });
    await this.audit(
      actor,
      id ? "ADMIN_CATEGORY_UPDATED" : "ADMIN_CATEGORY_CREATED",
      "CATEGORY",
      saved.id,
      before ? serializeCategory(before) : null,
      serializeCategory(saved),
      context,
    );
    return serializeCategory(saved);
  }

  async locations(actor: AdminActor, context: AdminRequestContext) {
    const items = await this.prisma.location.findMany({
      orderBy: [{ type: "asc" }, { name_en: "asc" }],
    });
    await this.audit(
      actor,
      "ADMIN_LOCATIONS_VIEWED",
      "LOCATION",
      null,
      null,
      null,
      context,
    );
    return { items: items.map(serializeLocation) };
  }

  async saveLocation(
    id: string | null,
    input: LocationDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    if (input.type !== "CITY" && !input.parentId) {
      throw new ConflictException("Thana and area locations require a parent.");
    }
    const data = locationData(input);
    const before = id
      ? await this.prisma.location.findUnique({ where: { id } })
      : null;
    if (id && !before) throw new NotFoundException();
    const saved = id
      ? await this.prisma.location.update({ where: { id }, data })
      : await this.prisma.location.create({ data });
    await this.audit(
      actor,
      id ? "ADMIN_LOCATION_UPDATED" : "ADMIN_LOCATION_CREATED",
      "LOCATION",
      saved.id,
      before ? serializeLocation(before) : null,
      serializeLocation(saved),
      context,
    );
    return serializeLocation(saved);
  }

  async config(actor: AdminActor, context: AdminRequestContext) {
    const [items, revisions] = await Promise.all([
      this.prisma.configSetting.findMany({ orderBy: { key: "asc" } }),
      this.prisma.configRevision.findMany({
        orderBy: { created_at: "desc" },
        take: 30,
      }),
    ]);
    await this.audit(
      actor,
      "ADMIN_CONFIG_VIEWED",
      "CONFIG",
      null,
      null,
      null,
      context,
    );
    return {
      items: items.map((item) => ({
        key: item.key,
        value: item.value_json,
        updatedAt: item.updated_at,
      })),
      revisions,
    };
  }

  async previewConfig(
    key: string,
    input: ConfigChangeDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const current = await this.prisma.configSetting.findUnique({
      where: { key },
    });
    if (!current) throw new NotFoundException();
    await this.audit(
      actor,
      "ADMIN_CONFIG_PREVIEWED",
      "CONFIG",
      null,
      null,
      { key },
      context,
    );
    return {
      key,
      before: current.value_json,
      after: input.value,
      changedFields: diffKeys(current.value_json, input.value),
      requiresConfirmation: true,
    };
  }

  async updateConfig(
    key: string,
    input: ConfigChangeDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    if (!input.confirm)
      throw new ConflictException(
        "Configuration changes require confirmation.",
      );
    const current = await this.prisma.configSetting.findUnique({
      where: { key },
    });
    if (!current) throw new NotFoundException();
    if (
      input.expectedUpdatedAt &&
      current.updated_at.toISOString() !== input.expectedUpdatedAt
    )
      throw new ConflictException("Configuration changed since preview.");
    const after = input.value as Prisma.InputJsonValue;
    const revision = await this.prisma.$transaction(async (transaction) => {
      await transaction.configSetting.update({
        where: { key },
        data: { value_json: after, updated_by: actor.userId },
      });
      const saved = await transaction.configRevision.create({
        data: {
          key,
          before_json: current.value_json as Prisma.InputJsonValue,
          after_json: after,
          reason: input.reason,
          changed_by: actor.userId,
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_CONFIG_CHANGED",
          "CONFIG_REVISION",
          saved.id,
          current.value_json as Prisma.InputJsonValue,
          after,
          context,
        ),
      });
      return saved;
    });
    return { key, value: input.value, revisionId: revision.id };
  }

  async revertConfig(
    revisionId: string,
    reason: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const revision = await this.prisma.configRevision.findUnique({
      where: { id: revisionId },
    });
    if (!revision) throw new NotFoundException();
    const current = await this.prisma.configSetting.findUnique({
      where: { key: revision.key },
    });
    if (!current) throw new NotFoundException();
    const reverted = await this.prisma.$transaction(async (transaction) => {
      await transaction.configSetting.update({
        where: { key: revision.key },
        data: {
          value_json: revision.before_json as Prisma.InputJsonValue,
          updated_by: actor.userId,
        },
      });
      const saved = await transaction.configRevision.create({
        data: {
          key: revision.key,
          before_json: current.value_json as Prisma.InputJsonValue,
          after_json: revision.before_json as Prisma.InputJsonValue,
          reason,
          changed_by: actor.userId,
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_CONFIG_REVERTED",
          "CONFIG_REVISION",
          saved.id,
          current.value_json as Prisma.InputJsonValue,
          revision.before_json as Prisma.InputJsonValue,
          context,
        ),
      });
      return saved;
    });
    return {
      key: revision.key,
      value: revision.before_json,
      revisionId: reverted.id,
    };
  }

  async flags(actor: AdminActor, context: AdminRequestContext) {
    const items = await this.prisma.featureFlag.findMany({
      orderBy: { key: "asc" },
    });
    await this.audit(
      actor,
      "ADMIN_FLAGS_VIEWED",
      "FEATURE_FLAG",
      null,
      null,
      null,
      context,
    );
    return {
      items: items.map((item) => ({
        key: item.key,
        isEnabled: item.is_enabled,
        rolloutPercent: item.rollout_percent,
        payload: item.payload_json,
        updatedAt: item.updated_at,
      })),
    };
  }

  async updateFlag(
    key: string,
    input: FlagChangeDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const current = await this.prisma.featureFlag.findUnique({
      where: { key },
    });
    if (!current) throw new NotFoundException();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.featureFlag.update({
        where: { key },
        data: {
          is_enabled: input.isEnabled,
          rollout_percent: input.rolloutPercent,
          payload_json: input.payload as Prisma.InputJsonValue | undefined,
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_FEATURE_FLAG_CHANGED",
          "FEATURE_FLAG",
          null,
          {
            key,
            isEnabled: current.is_enabled,
            rolloutPercent: current.rollout_percent,
          },
          {
            key,
            isEnabled: input.isEnabled,
            rolloutPercent: input.rolloutPercent,
            reason: input.reason,
          },
          context,
        ),
      });
      return item;
    });
    return {
      key: updated.key,
      isEnabled: updated.is_enabled,
      rolloutPercent: updated.rollout_percent,
    };
  }

  async disputes(
    query: PageQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const items = await this.prisma.dispute.findMany({
      take: query.limit,
      orderBy: { created_at: "asc" },
      include: {
        job: { select: { id: true, title: true, status: true } },
        opened_by: { include: { profile: true } },
        evidence: { orderBy: { created_at: "asc" } },
      },
    });
    await this.audit(
      actor,
      "ADMIN_DISPUTES_VIEWED",
      "DISPUTE",
      null,
      null,
      null,
      context,
    );
    return {
      items: items.map((item) => ({
        ...item,
        refund_poisha: item.refund_poisha?.toString() ?? null,
      })),
    };
  }

  async resolveDispute(
    id: string,
    input: DisputeResolutionDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { job: true },
    });
    if (!dispute) throw new NotFoundException();
    if (
      dispute.status === DisputeStatus.RESOLVED ||
      dispute.status === DisputeStatus.CLOSED
    )
      throw new ConflictException("Dispute is already resolved.");
    const targetStatus = input.jobStatus ?? JobStatus.COMPLETED;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.dispute.update({
        where: { id },
        data: {
          status: DisputeStatus.RESOLVED,
          resolution: input.resolution,
          resolved_by: actor.userId,
          resolved_at: new Date(),
          refund_poisha: BigInt(input.refundPoisha),
        },
      });
      if (dispute.job.status === JobStatus.DISPUTED) {
        await transaction.job.update({
          where: { id: dispute.job_id },
          data: { status: targetStatus },
        });
        await transaction.jobStatusHistory.create({
          data: {
            job_id: dispute.job_id,
            from_status: JobStatus.DISPUTED,
            to_status: targetStatus,
            actor_user_id: actor.userId,
            actor_type: JobActorType.ADMIN,
            reason: input.reason,
          },
        });
      }
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_DISPUTE_RESOLVED",
          "DISPUTE",
          id,
          { status: dispute.status },
          {
            status: DisputeStatus.RESOLVED,
            resolution: input.resolution,
            refundPoisha: input.refundPoisha,
            jobStatus: targetStatus,
            reason: input.reason,
          },
          context,
        ),
      });
    });
    return {
      id,
      status: DisputeStatus.RESOLVED,
      refundPoisha: input.refundPoisha,
      jobStatus: targetStatus,
    };
  }

  async campaignDryRun(
    input: CampaignDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const where = campaignWhere(input.segment);
    const count = await this.prisma.user.count({ where });
    await this.audit(
      actor,
      "ADMIN_NOTIFICATION_DRY_RUN",
      "NOTIFICATION_CAMPAIGN",
      null,
      null,
      {
        name: input.name,
        segment: input.segment as Prisma.InputJsonObject,
        count,
      },
      context,
    );
    return {
      audienceCount: count,
      preview: { title: input.title, body: input.body },
      throttlePerMinute: input.throttlePerMinute,
    };
  }

  async sendCampaign(
    input: CampaignDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const recipients = await this.prisma.user.findMany({
      where: campaignWhere(input.segment),
      select: { id: true },
      take: 10_000,
    });
    const batch = recipients.slice(0, input.throttlePerMinute);
    const campaign = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.notificationCampaign.create({
        data: {
          name: input.name,
          segment_json: input.segment as Prisma.InputJsonValue,
          title: input.title,
          body: input.body,
          throttle_per_minute: input.throttlePerMinute,
          dry_run_count: recipients.length,
          sent_count: batch.length,
          status: batch.length === recipients.length ? "COMPLETED" : "PARTIAL",
          created_by: actor.userId,
          sent_at: new Date(),
        },
      });
      if (batch.length)
        await transaction.notification.createMany({
          data: batch.map((recipient) => ({
            user_id: recipient.id,
            type: "ADMIN_CAMPAIGN",
            title_key: input.title,
            body_key: input.body,
            payload_json: { campaignId: saved.id },
          })),
        });
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_NOTIFICATION_CAMPAIGN_SENT",
          "NOTIFICATION_CAMPAIGN",
          saved.id,
          null,
          {
            audienceCount: recipients.length,
            sentCount: batch.length,
            throttlePerMinute: input.throttlePerMinute,
          },
          context,
        ),
      });
      return saved;
    });
    return {
      id: campaign.id,
      audienceCount: recipients.length,
      sentCount: batch.length,
      status: campaign.status,
    };
  }

  async analytics(actor: AdminActor, context: AdminRequestContext) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const [completedJobs, newUsers, applications, cancellations] =
      await Promise.all([
        this.prisma.job.count({ where: { completed_at: { gte: since } } }),
        this.prisma.user.count({ where: { created_at: { gte: since } } }),
        this.prisma.application.count({
          where: { created_at: { gte: since } },
        }),
        this.prisma.job.count({
          where: {
            updated_at: { gte: since },
            status: {
              in: [
                JobStatus.CANCELLED_BY_CUSTOMER,
                JobStatus.CANCELLED_BY_WORKER,
              ],
            },
          },
        }),
      ]);
    await this.audit(
      actor,
      "ADMIN_ANALYTICS_VIEWED",
      "ANALYTICS",
      null,
      null,
      null,
      context,
    );
    return {
      periodDays: 7,
      completedJobs,
      newUsers,
      applications,
      cancellations,
      note: "Phase 13 adds materialised liquidity and cohort metrics.",
    };
  }

  async auditLogs(
    query: PageQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const items = await this.prisma.auditLog.findMany({
      take: query.limit,
      orderBy: { created_at: "desc" },
      include: { actor: { select: { email: true } } },
    });
    await this.audit(
      actor,
      "ADMIN_AUDIT_LOG_VIEWED",
      "AUDIT_LOG",
      null,
      null,
      null,
      context,
    );
    return { items };
  }

  private audit(
    actor: AdminActor,
    action: string,
    entity: string,
    entityId: string | null,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue | null,
    context: AdminRequestContext,
  ) {
    return this.prisma.auditLog.create({
      data: this.auditData(
        actor,
        action,
        entity,
        entityId,
        before,
        after,
        context,
      ),
    });
  }

  private auditCreate(
    actor: AdminActor,
    action: string,
    entity: string,
    entityId: string | null,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue | null,
    context: AdminRequestContext,
  ) {
    return this.prisma.auditLog.create({
      data: this.auditData(
        actor,
        action,
        entity,
        entityId,
        before,
        after,
        context,
      ),
    });
  }

  private auditData(
    actor: AdminActor,
    action: string,
    entity: string,
    entityId: string | null,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue | null,
    context: AdminRequestContext,
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
}

function serializeJob(job: any) {
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    isFeatured: job.is_featured,
    poster: {
      id: job.poster_user_id,
      name: job.poster.profile?.display_name ?? "Unknown",
    },
    applicationsCount: job._count.applications,
    assignmentsCount: job._count.assignments,
    updatedAt: job.updated_at,
    history: job.status_history,
  };
}

function categoryData(input: CategoryDto): Prisma.CategoryUncheckedCreateInput {
  return {
    parent_id: input.parentId ?? null,
    slug: input.slug,
    name_en: input.nameEn,
    name_bn: input.nameBn,
    icon: input.icon,
    sort_order: input.sortOrder,
    is_active: input.isActive,
    requires_manual_approval: input.requiresManualApproval,
    min_age: input.minAge,
    requires_certificate: input.requiresCertificate,
    requires_identity: input.requiresIdentity,
    requires_poster_identity: input.requiresPosterIdentity,
    requires_references: input.requiresReferences,
    requires_licence: input.requiresLicence,
    safety_notice: input.safetyNotice,
    unsafe_for_students: input.unsafeForStudents,
  };
}

function serializeCategory(item: any) {
  return {
    id: item.id,
    parentId: item.parent_id,
    slug: item.slug,
    nameEn: item.name_en,
    nameBn: item.name_bn,
    icon: item.icon,
    sortOrder: item.sort_order,
    isActive: item.is_active,
    requiresManualApproval: item.requires_manual_approval,
    minAge: item.min_age,
    requiresCertificate: item.requires_certificate,
    requiresIdentity: item.requires_identity,
    requiresPosterIdentity: item.requires_poster_identity,
    requiresReferences: item.requires_references,
    requiresLicence: item.requires_licence,
    safetyNotice: item.safety_notice,
    unsafeForStudents: item.unsafe_for_students,
  };
}

function locationData(input: LocationDto): Prisma.LocationUncheckedCreateInput {
  return {
    parent_id: input.parentId ?? null,
    type: input.type,
    name_en: input.nameEn,
    name_bn: input.nameBn,
    lat: input.lat,
    lng: input.lng,
    radius_km: input.radiusKm,
    is_active: input.isActive,
  };
}

function serializeLocation(item: any) {
  return {
    id: item.id,
    parentId: item.parent_id,
    type: item.type,
    nameEn: item.name_en,
    nameBn: item.name_bn,
    lat: item.lat?.toString() ?? null,
    lng: item.lng?.toString() ?? null,
    radiusKm: item.radius_km?.toString() ?? null,
    isActive: item.is_active,
  };
}

function diffKeys(
  before: Prisma.JsonValue,
  after: Record<string, unknown>,
): string[] {
  const previous =
    before && typeof before === "object" && !Array.isArray(before)
      ? (before as Record<string, unknown>)
      : {};
  return [...new Set([...Object.keys(previous), ...Object.keys(after)])].filter(
    (key) => JSON.stringify(previous[key]) !== JSON.stringify(after[key]),
  );
}

function trustForKind(kind: string): TrustLevel {
  if (kind === "BUSINESS") return TrustLevel.BUSINESS;
  if (kind === "SKILL") return TrustLevel.SKILL;
  if (kind === "IDENTITY") return TrustLevel.IDENTITY;
  return TrustLevel.PHONE;
}

function campaignWhere(
  segment: Record<string, unknown>,
): Prisma.UserWhereInput {
  const status =
    typeof segment.status === "string" &&
    Object.values(UserStatus).includes(segment.status as UserStatus)
      ? (segment.status as UserStatus)
      : UserStatus.ACTIVE;
  const role = typeof segment.role === "string" ? segment.role : undefined;
  return {
    status,
    deleted_at: null,
    ...(role && ["CUSTOMER", "WORKER", "BUSINESS"].includes(role)
      ? { role_modes: { has: role as any } }
      : {}),
  };
}

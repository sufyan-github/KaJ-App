import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { PolicyResourceContext } from "./ability.factory";
import { PolicyRule } from "./policy.types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Loads who owns the record a route names, for the ownership policies
 * (job-poster, assigned-worker, conversation-participant), so ownership is
 * declared on the route instead of re-checked by hand in each service.
 * Unknown records give an empty context, which the policy guard answers
 * with 404 (no existence leak).
 */
@Injectable()
export class PolicyResourceResolver {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns undefined when a parameter is not a UUID: the route's own
   * ParseUUIDPipe then answers 400, as it did before.
   */
  async resolve(
    rules: readonly PolicyRule[],
    params: Record<string, string | undefined>,
  ): Promise<PolicyResourceContext | undefined> {
    const context: PolicyResourceContext = {};
    for (const rule of rules) {
      if (!rule.source) continue;
      const id = params[rule.param ?? "id"];
      if (!id || !UUID.test(id)) return undefined;
      switch (rule.source) {
        case "job": {
          const job = await this.prisma.job.findFirst({
            where: { id, deleted_at: null },
            select: { poster_user_id: true, opportunity_type: true },
          });
          if (job) {
            context.jobPosterId = job.poster_user_id;
            context.opportunityType = job.opportunity_type;
          }
          break;
        }
        case "application": {
          const application = await this.prisma.application.findUnique({
            where: { id },
            select: { job: { select: { poster_user_id: true } } },
          });
          if (application) context.jobPosterId = application.job.poster_user_id;
          break;
        }
        case "assignment": {
          const assignment = await this.prisma.assignment.findUnique({
            where: { id },
            select: {
              worker_user_id: true,
              job: { select: { poster_user_id: true } },
            },
          });
          if (assignment) {
            context.assignedWorkerId = assignment.worker_user_id;
            context.jobPosterId = assignment.job.poster_user_id;
          }
          break;
        }
        case "business": {
          const business = await this.prisma.businessProfile.findFirst({
            where: { id, deleted_at: null },
            select: {
              members: {
                where: { accepted_at: { not: null } },
                select: { user_id: true, role: true },
              },
            },
          });
          if (business)
            context.businessMembers = business.members.map((member) => ({
              userId: member.user_id,
              role: member.role,
            }));
          break;
        }
        case "conversation": {
          const conversation = await this.prisma.conversation.findFirst({
            where: { id, deleted_at: null },
            select: { participants: { select: { user_id: true } } },
          });
          if (conversation)
            context.conversationParticipantIds = conversation.participants.map(
              (item) => item.user_id,
            );
          break;
        }
      }
    }
    return context;
  }
}

import { Injectable } from "@nestjs/common";
import { AssignmentStatus } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

// A hire that happened: offered and not declined. Cancelled and completed
// work still counts, so the parties keep seeing each other's photo.
const HIRED_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.CONFIRMED,
  AssignmentStatus.COMPLETED,
  AssignmentStatus.CANCELLED,
];

/**
 * What two people have done together on the marketplace, in either role.
 * Privacy settings (photo after hire, messages after hire, hidden profiles)
 * read this instead of re-deriving it per module.
 */
@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  /** One of them hired the other (a confirmed or finished assignment). */
  async hired(firstUserId: string, secondUserId: string): Promise<boolean> {
    if (firstUserId === secondUserId) return false;
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        status: { in: HIRED_STATUSES },
        OR: [
          {
            worker_user_id: firstUserId,
            job: { poster_user_id: secondUserId },
          },
          {
            worker_user_id: secondUserId,
            job: { poster_user_id: firstUserId },
          },
        ],
      },
      select: { id: true },
    });
    return assignment !== null;
  }

  /** Of `workerIds`, the workers `posterUserId` has hired. */
  async hiredWorkers(
    posterUserId: string,
    workerIds: string[],
  ): Promise<Set<string>> {
    if (workerIds.length === 0) return new Set();
    const rows = await this.prisma.assignment.findMany({
      where: {
        status: { in: HIRED_STATUSES },
        worker_user_id: { in: workerIds },
        job: { poster_user_id: posterUserId },
      },
      select: { worker_user_id: true },
      distinct: ["worker_user_id"],
    });
    return new Set(rows.map((row) => row.worker_user_id));
  }

  /** Of `otherUserIds`, those with a hire with `userId`, in either role. */
  async hiredWith(
    userId: string,
    otherUserIds: string[],
  ): Promise<Set<string>> {
    const others = otherUserIds.filter((id) => id !== userId);
    if (others.length === 0) return new Set();
    const rows = await this.prisma.assignment.findMany({
      where: {
        status: { in: HIRED_STATUSES },
        OR: [
          { worker_user_id: userId, job: { poster_user_id: { in: others } } },
          { worker_user_id: { in: others }, job: { poster_user_id: userId } },
        ],
      },
      select: {
        worker_user_id: true,
        job: { select: { poster_user_id: true } },
      },
    });
    return new Set(
      rows.map((row) =>
        row.worker_user_id === userId
          ? row.job.poster_user_id
          : row.worker_user_id,
      ),
    );
  }

  /**
   * They are already dealing with each other: one applied to, was offered or
   * was hired for a job the other posted.
   */
  async engaged(firstUserId: string, secondUserId: string): Promise<boolean> {
    if (firstUserId === secondUserId) return false;
    const pair = (worker: string, poster: string) => ({
      worker_user_id: worker,
      job: { poster_user_id: poster },
    });
    const [application, assignment] = await Promise.all([
      this.prisma.application.findFirst({
        where: {
          OR: [
            pair(firstUserId, secondUserId),
            pair(secondUserId, firstUserId),
          ],
        },
        select: { id: true },
      }),
      this.prisma.assignment.findFirst({
        where: {
          OR: [
            pair(firstUserId, secondUserId),
            pair(secondUserId, firstUserId),
          ],
        },
        select: { id: true },
      }),
    ]);
    return application !== null || assignment !== null;
  }
}

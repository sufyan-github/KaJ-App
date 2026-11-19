import { AdminRole } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { adminRoleForbiddenError } from "./admin-auth.errors";
import { AdminActor } from "./admin-auth.types";

/**
 * R1 (A3, A9, A10): only an ADMIN acts on a staff account (anyone with an
 * admin credential). A MODERATOR cannot ban, restore or reactivate the only
 * ADMIN, and SUPPORT cannot sign staff out.
 */
export async function assertMayActOnAccount(
  prisma: Pick<PrismaService, "adminCredential">,
  actor: AdminActor,
  targetUserId: string,
): Promise<void> {
  if (actor.role === AdminRole.ADMIN) return;
  const staff = await prisma.adminCredential.count({
    where: { user_id: targetUserId },
  });
  if (staff > 0) throw adminRoleForbiddenError();
}

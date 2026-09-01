import { AdminRole } from "@prisma/client";

export interface AdminActor {
  email: string;
  role: AdminRole;
  sessionId: string;
  userId: string;
}

export interface AdminRequestContext {
  ip: string | null;
  ua: string | null;
}

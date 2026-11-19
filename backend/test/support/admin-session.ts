import { createHash, randomBytes, randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { AdminRole } from "@prisma/client";

import {
  encryptTotpSecret,
  tokenHash,
} from "../../src/modules/admin-auth/admin-auth.primitives";
import { Actor, HttpHarness } from "./http-harness";

/**
 * A staff account with `role` and a live admin session, without the
 * password + TOTP sign-in. The token goes in `Authorization: Bearer`, which
 * is what the console's proxy sends.
 */
export async function adminSession(
  api: HttpHarness,
  role: AdminRole,
): Promise<Actor & { email: string }> {
  const config = api.app.get(ConfigService);
  const sessionSecret =
    config.get<string>("ADMIN_SESSION_SECRET") ||
    createHash("sha256")
      .update("kaj:admin-session:local-development-only")
      .digest("hex");
  const totpKey =
    config.get<string>("ADMIN_TOTP_ENCRYPTION_KEY") ||
    createHash("sha256")
      .update("kaj:admin-totp:local-development-only")
      .digest("hex");
  const email = `${role.toLowerCase()}-${randomUUID()}@test.invalid`;
  const user = await api.db.user.create({
    data: {
      email,
      is_admin: true,
      profile: { create: { display_name: `Test ${role}` } },
      admin_credential: {
        create: {
          role,
          totp_secret_ciphertext: encryptTotpSecret(
            "JBSWY3DPEHPK3PXP",
            totpKey,
          ),
          totp_confirmed_at: new Date(),
        },
      },
    },
  });
  api.userIds.push(user.id);
  const token = randomBytes(48).toString("base64url");
  await api.db.adminSession.create({
    data: {
      user_id: user.id,
      token_hash: tokenHash(token, sessionSecret),
      expires_at: new Date(Date.now() + 30 * 60_000),
    },
  });
  return { id: user.id, token, email };
}

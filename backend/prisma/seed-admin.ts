/**
 * SEC-1: which admin, if any, the development seed may create.
 *
 * - Never in production (the seed as a whole refuses too).
 * - Only from explicit ADMIN_SEED_PASSWORD and ADMIN_SEED_TOTP_SECRET; there
 *   are no fallback credentials in code.
 * - The example values committed in .env.example only against a database on
 *   this machine, so no hosted environment can get a publicly known login.
 *
 * Messages never contain a secret.
 */
const COMMITTED_EXAMPLE = {
  password: "KajAdminLocal123!",
  totpSecret: "JBSWY3DPEHPK3PXP",
} as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type AdminSeedDecision =
  | { seed: false; reason: string }
  | { seed: true; email: string; password: string; totpSecret: string };

export function adminSeedDecision(
  env: Record<string, string | undefined>,
): AdminSeedDecision {
  if (env.NODE_ENV === "production")
    throw new Error("Refusing to seed an admin account in production.");
  const password = env.ADMIN_SEED_PASSWORD?.trim();
  const totpSecret = env.ADMIN_SEED_TOTP_SECRET?.trim();
  if (!password || !totpSecret)
    return {
      seed: false,
      reason:
        "Admin not seeded: set ADMIN_SEED_PASSWORD and ADMIN_SEED_TOTP_SECRET to create one.",
    };
  const usesExample =
    password === COMMITTED_EXAMPLE.password ||
    totpSecret === COMMITTED_EXAMPLE.totpSecret;
  if (usesExample && !isLocalDatabase(env.DATABASE_URL))
    throw new Error(
      "Refusing to seed the committed example admin credentials into a database that is not on this machine. Set your own ADMIN_SEED_PASSWORD and ADMIN_SEED_TOTP_SECRET.",
    );
  return {
    seed: true,
    email: env.ADMIN_SEED_EMAIL?.trim() || "admin@kaj.local",
    password,
    totpSecret,
  };
}

function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

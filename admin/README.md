# KAAJ Operations

The Phase 8 administration shell runs at `http://localhost:3200` and proxies authentication through
the NestJS API. The opaque admin session is stored only in a strict, HTTP-only cookie and expires
after 30 minutes of inactivity.

The console includes dashboard health, user moderation, job and application rescue, verification
review, D12 category safety policies, data-driven locations, reversible configuration, feature
flags, disputes, throttled notification campaigns, basic analytics, and the audit trail.

For local development, run the database seed and then start both applications:

```bash
pnpm --filter @kaj/backend seed
pnpm --filter @kaj/backend dev
pnpm --filter @kaj/admin dev
```

Local-only seed credentials come from `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, and
`ADMIN_SEED_TOTP_SECRET`. Replace all three and configure the two admin encryption/session secrets
outside local development. Production startup rejects short or missing secrets.

Tests: `pnpm --filter @kaj/admin test` (unit, `node --test`), `pnpm --filter @kaj/admin e2e`
(Playwright against a mocked API) and `pnpm --filter @kaj/admin e2e:real` (one journey against a
real backend).

## Roles

What each role sees comes from one matrix, `lib/admin-route-roles.ts`, generated from the backend's
`@AdminRoles` decorators (`backend/test/admin-role-matrix.spec.ts` fails when they disagree; run it
with `UPDATE_ADMIN_ROLE_MATRIX=1` to regenerate). `lib/permissions.ts` maps modules and tabs to the
reads they need, and `<Can route="POST …">` hides an action the role would get a 403 for. The
server still enforces every call; `backend/test/admin-role-matrix.prisma.e2e-spec.ts` calls every
admin route as each role.

## Staff

ADMIN invites staff (email, name, role, reason) and gets a temporary password and an authenticator
secret once; they are not stored in clear or logged, so hand them over in person. ADMIN can change a
role or deactivate (ends every session at once) and reactivate (new sign-in details). Nobody changes
their own account, and the last active ADMIN cannot be removed.

## Security headers

`proxy.ts` gives every page a fresh nonce and a strict Content-Security-Policy (no
`unsafe-inline`; `frame-ancestors 'none'`); the layout renders per request so Next can apply the
nonce. `next.config.ts` adds `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`,
a Permissions-Policy, COOP and, in production, HSTS; `/api/*` gets `default-src 'none'`. The
builders live in `lib/security-headers.ts`.

Verification documents load from signed storage URLs, so their origin must be allowed: set
`KAJ_STORAGE_ORIGINS` (space-separated origins, e.g. `https://files.example.com`) wherever the
console is deployed. Without it the console falls back to the origin of `S3_ENDPOINT` (local MinIO)
and otherwise allows no external documents.

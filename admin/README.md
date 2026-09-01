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

Run the six highest-risk browser journeys with `pnpm --filter @kaj/admin e2e`.

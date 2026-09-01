# KAAJ Operations

The Phase 8 administration shell runs at `http://localhost:3200` and proxies authentication through
the NestJS API. The opaque admin session is stored only in a strict, HTTP-only cookie and expires
after 30 minutes of inactivity.

For local development, run the database seed and then start both applications:

```bash
pnpm --filter @kaj/backend seed
pnpm --filter @kaj/backend dev
pnpm --filter @kaj/admin dev
```

Local-only seed credentials come from `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, and
`ADMIN_SEED_TOTP_SECRET`. Replace all three and configure the two admin encryption/session secrets
outside local development. Production startup rejects short or missing secrets.

# P1-AUTH-04 — Phone OTP authentication

**Status:** COMPLETE
**Completed:** 2026-08-18
**Phase:** Phase 1 — foundation
**Commit:** This completion record is part of the task commit; exact hash is in Git history and the final task report.
**Remote:** `origin/agent/p1-auth-04-phone-otp` (draft pull request to `main`)

## Scope

This task implemented Bangladesh phone OTP login, authentication sessions, device-bound refresh
tokens, rotation and family reuse response, logout, session retrieval, and device registration. It
did not add authorization policies, a production SMS provider, Flutter login screens, password or
social login, international numbers, or production deployment.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` Parts A and B, D2 auth storage, E1 error/envelope rules, E2 auth endpoint
  inventory, and P1-AUTH-04.
- P1-INF-02 request context, envelope, validation, logging, and infrastructure modules.
- P1-INF-03 `users`, `user_devices`, `refresh_tokens`, `otp_challenges`, and `feature_flags` schema.
- Acceptance precedence: an OTP must never appear in an API response or log.

## Output

- Auth controller, service, DTOs, access guard, current-auth decorator, token service, phone
  normalizer, OTP generator, repository port, Prisma adapter, and auth-specific errors.
- Atomic Redis rate-limit adapter for five requests per hour per hashed phone, twenty per hour per
  hashed IP, and the configured resend cooldown.
- SMS port and safe console adapter that logs only a masked phone and masked code marker.
- Globally shared injectable clock plus `Retry-After` support in the API exception filter.
- `@nestjs/jwt` and `bcryptjs` production dependencies.
- Unit, API integration, and opt-in PostgreSQL integration coverage.

## How it operates

The request endpoint normalizes a Bangladesh mobile number to E.164, consumes hashed Redis rate
keys, generates a cryptographically random six-digit code, stores only its bcrypt hash for five
minutes, and sends the code through the SMS port. Verification permits at most five failed
comparisons, atomically consumes a challenge, upserts the user/device, and returns a 15-minute HS256
access token plus a 30-day opaque refresh token.

Only an HMAC-SHA-256 refresh-token hash is stored. Every refresh atomically revokes the presented
token and creates its successor in the same device-bound family. Presenting a revoked token revokes
every still-active member of that family and requires login again. Protected session/device routes
verify token type, signature, expiry, subject, and device claims.

## Process and procedure

1. Merged P1-INF-03, updated `main`, and created the task branch.
2. Added the required failing API scenarios before implementing auth modules.
3. Implemented normalization, hashing, throttling, one-time consumption, token issuance, refresh
   rotation, family revocation, logout, protected session, and device operations.
4. Added primitive security tests and an opt-in real-PostgreSQL integration test.
5. Applied the existing migration to an isolated PostgreSQL server and exercised persistence,
   rotation, replay detection, and family revocation through HTTP.
6. Stopped and removed the isolated test database, ran all repository gates, and updated task docs.

## Verification evidence

- Focused auth tests: PASS — 21 unit/API tests.
- Isolated PostgreSQL auth tests: PASS — hashes persisted, wrong-attempt caps and rotation were
  atomic, and a reused family was fully revoked.
- Root test command: PASS — 6 root tests and 36 backend tests; the opt-in database tests are skipped
  in the ordinary run.
- `corepack pnpm typecheck`: PASS.
- `corepack pnpm build`: PASS.
- `corepack pnpm lint`: PASS.
- `corepack pnpm audit:prod`: PASS — only the four already documented gated exceptions remain.

## Acceptance results

| Acceptance item                             | Result | Evidence                                                                         |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| Normalize BD E.164 and reject non-BD        | PASS   | Primitive and HTTP cases cover local, `880`, `+880`, and invalid foreign inputs. |
| Enforce phone/IP limits and `Retry-After`   | PASS   | Atomic Redis adapter plus sixth-request HTTP assertion.                          |
| Six-digit, bcrypt-hashed, five-minute OTP   | PASS   | Generator/TTL tests and database hash assertion.                                 |
| Five attempts, expiry, one-time consumption | PASS   | Wrong, sixth, expired, and replayed challenge cases.                             |
| 15-minute access and 30-day device refresh  | PASS   | Injected-clock expiry case and persisted device-bound refresh record.            |
| Rotation and reuse revoke the family        | PASS   | In-memory API suite and live PostgreSQL transaction test.                        |
| Protected session and device endpoints      | PASS   | Valid/expired bearer and register/delete device cases.                           |
| OTP absent from responses and logs          | PASS   | Response assertions and console-output interception.                             |

## Decisions and limitations

- The final acceptance rule forbidding OTPs in logs takes precedence over the earlier development
  adapter wording; the console adapter therefore emits a masked event, not the real code.
- Refresh tokens are high-entropy opaque values rather than JWTs. This permits database-backed
  rotation/revocation while keeping bearer material out of storage.
- Phone and IP limiter keys are SHA-256 digests, so raw identifiers do not enter Redis keys.
- The local adapter is not an SMS delivery integration; carrier testing remains part of the human
  and provider workstreams. Production secrets and a production SMS provider remain mandatory.
- Phase 0 research, legal, residency, and production launch gates remain open under the recorded
  early-engineering override.

## Next task

P1-AUTH-05 — authorization foundation with default-deny guards and a growing policy matrix.

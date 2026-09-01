# P2-USR-02 — Profile and Role Modes

Implemented and verified locally on 1 September 2026.

## Delivered

- authenticated profile update endpoint with normalized profile output
- idempotent customer and worker role activation on one user row
- preservation of every previously activated role while switching the active role
- lazy creation of customer and worker profile rows on first activation
- guaranteed base profile creation with PHONE trust after OTP authentication
- role-specific home payload and onboarding-required signal
- actionable role-guard denial containing `error.auth.role_required` and an `activate_role` action

## Verification

- role-mode pure-function tests cover activation, duplicate prevention, and both-role switching
- service tests cover lazy role profile creation, role preservation, and idempotency
- authorization integration test confirms a customer-only actor receives the actionable worker-role 403
- backend Prettier check: clean
- backend TypeScript typecheck: clean
- backend Jest: 77 passed, 2 intentionally skipped
- backend Nest build: successful


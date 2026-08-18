# Contributing to KAJ

KAJ is built one task ID at a time under `KAJ_BUILD_GUIDE.md`. Read the current task in
`docs/COMPLETION_TRACKER.md` before changing code.

## Local workflow

1. Create a focused branch from the current default branch.
2. Keep the change inside one build-guide task ID.
3. Add or update tests before implementation when the task has testable behavior.
4. Run `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm test`.
5. Update the tracker, changelog, and task completion record only when acceptance is satisfied.
6. Use a conventional commit such as `feat(auth): add OTP challenge endpoint`.

Do not commit `.env`, access tokens, phone numbers, identity documents, production data, or other
personal information. Never enable a gated payment or AI feature without its documented approval.

## Pull requests

Describe the task ID, scope, checks run, migration impact, security/privacy impact, and remaining
limitations. A pull request must not bundle unrelated refactors or a future-phase feature.

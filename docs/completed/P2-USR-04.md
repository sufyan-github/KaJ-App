# P2-USR-04 — Availability Engine

Implemented and verified locally on 1 September 2026.

## Delivered

- pure, database-free D4 availability calculator
- fixed Asia/Dhaka UTC+06:00 local-day arithmetic
- weekly rules and job windows crossing midnight
- unioned rule coverage with overlapping exception subtraction
- configurable minimum coverage and 30-minute default travel buffer
- hard conflicts for confirmed assignments, including buffered near-overlaps
- neutral `coverage: null` handling for workers with no rules
- no-fixed-time project handling
- next-four recurrence evaluation requiring at least three available occurrences
- worker-only availability read and atomic whole-set replacement endpoints
- owned blackout-exception create and delete endpoints

## Verification

- every specified D4 edge case is covered
- deterministic property test checks 1,000 randomized rule/window pairs
- calculator coverage: 100% statements, branches, functions, and lines
- persistence tests cover atomic replacement, invalid exception windows, and ownership-safe deletion
- backend Prettier check: clean
- backend TypeScript typecheck: clean
- backend Jest: 102 passed, 2 intentionally skipped
- backend Nest build: successful


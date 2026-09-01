# P2-USR-03 — Worker Skills and Rates

Implemented and verified locally on 1 September 2026.

## Delivered

- authenticated worker-only `GET/PUT /profiles/me/skills` endpoints
- atomic whole-set skill replacement
- maximum 15 skills per worker, following the authoritative build guide
- duplicate, unknown, and inactive skill rejection
- per-skill level and optional fractional years of experience
- bilingual English and Bangla skill names in response payloads
- authenticated worker-only `PUT /profiles/me/worker` rate update
- optional hourly, daily, and monthly rates, including explicit clearing with `null`
- inclusive 5,000–5,000,000 poisha validation bounds
- no requirement to set a rate during profile onboarding

## Verification

- pure rule tests cover the maximum and duplicate rejection
- service tests cover atomic replacement, unknown skills, and bilingual output
- DTO tests cover minimum, maximum, out-of-range, and blank rate values
- backend Prettier check: clean
- backend TypeScript typecheck: clean
- backend Jest: 87 passed, 2 intentionally skipped
- backend Nest build: successful


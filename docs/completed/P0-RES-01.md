# P0-RES-01 — Competitor Study

**Status:** COMPLETE
**Completed:** 2026-08-18
**Phase:** Phase 0 — research and validation
**Commit:** This completion record is part of the task commit; the exact hash is in Git history and the final task report.
**Remote:** origin/main

## Scope

Create `docs/competitor-analysis.md` for every Bangladesh competitor, informal Rajshahi substitute, international marketplace, trust model, and dispatch model prescribed by `KAJ_BUILD_GUIDE.md` C1. Each entry uses the exact four-column schema and all 27 required fields.

This task did not create the P0-RES-02 gap matrix, write product code, connect to a database, create environment files, install packages, or claim that public platform marketing was independently verified.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` Part A source-of-truth and execution rules.
- `KAJ_BUILD_GUIDE.md` C1 competitor list, exact table, source, confidence, assumption, and commission rules.
- `KAJ_BUILD_GUIDE.md` C2 boundary, keeping the gap matrix for the next task.
- `KAJ_PREBUILD_PLAN.md` research-first and human-review gates.
- `KAJ_UI_REQUIREMENTS.md` context for later mobile/Bangla/accessibility comparison, without designing UI in this task.
- Repository completion-report and tracker procedures.

## Output

- Created `docs/competitor-analysis.md`.
- Updated `docs/COMPLETION_TRACKER.md`.
- Updated `CHANGELOG.md`.
- Created this completion record.

The study contains 28 separate tables:

- 13 Bangladesh formal/digital alternatives.
- 4 Rajshahi informal-channel archetypes.
- 11 international marketplaces or analogous trust/dispatch models.

It cites 71 public sources and includes a direct source URL in every one of the 756 required data rows.

## How it operates

The research document is a traceable input to later planning:

1. A reader selects a competitor/channel section.
2. Each of the 27 fields separates the finding, direct evidence URL, and `H`, `M`, or `L` confidence.
3. `Unknown` preserves missing public information without treating absence of evidence as absence of a feature.
4. Low-confidence inferences are marked `ASSUMPTION` for later field validation.
5. Source registers provide descriptive names for the row-level links.
6. P0-RES-02 will score capabilities from this evidence without silently turning competitor claims into KAJ requirements.

## Process and procedure

1. Restated the one-task boundary and acceptance rules.
2. Researched the required Bangladesh products and recorded ambiguous identities/domains conservatively.
3. Researched Rajshahi Facebook, student/career, tutor, and staffing-broker substitutes; local practices without public evidence were deferred to interviews.
4. Researched all required international products using current first-party pages where available.
5. Created one exact-schema table per competitor/channel.
6. Added direct row-level URLs, confidence labels, assumptions, and source registers.
7. Ran structural, evidence, confidence, secret, whitespace, and Git checks.
8. Updated project tracking and recorded the next task.

## Verification evidence

- Structural parser: `28` competitor/channel sections; `27` unique required fields in every section; `756/756` expected data rows.
- Schema check: `28` exact four-column headers; `0` legacy two-column headers.
- Evidence check: `0` data rows without a direct `http(s)` source link.
- Confidence check: all data rows end in exactly `H`, `M`, or `L`.
- Assumption check: inferred low-confidence findings use `ASSUMPTION`; unknowns remain explicitly `Unknown`.
- Credential scan: `0` matches for the supplied token prefix anywhere in workspace files.
- `git diff --check`: required to pass before commit.
- No runtime tests were applicable because this step changes documentation only.

## Acceptance results

| Acceptance item | Result | Evidence |
|---|---|---|
| All prescribed Bangladesh competitors covered | PASS | 13 named tables, including an explicit low-confidence no-result record for Kaj Ki Kaj. |
| Informal Rajshahi alternatives covered | PASS | Facebook/groups, RUET/RU networks, tutor boards/media, and local staffing-broker archetype. |
| All prescribed international comparators covered | PASS | 11 tables, with Airbnb limited to trust and Uber limited to dispatch. |
| One exact table per competitor/channel | PASS | 28 four-column tables. |
| All 27 exact fields in every table | PASS | Structural parser reports 756/756 rows and no malformed section. |
| URL in every row | PASS | Row validator reports zero missing direct URLs. |
| Confidence in every row | PASS | Only `H`, `M`, or `L`; no invalid values. |
| Unverified inference marked | PASS | Explicit `ASSUMPTION` and `Unknown` conventions are documented and applied. |
| No invented commission | PASS | Only published amounts/rates are stated; unclear, historical, or variable economics are labelled. |
| Gap matrix deferred | PASS | P0-RES-02 is named as the next task and no capability scoring was added. |
| Human review gate preserved | PASS | Deliverable remains `Status: draft — owner review required`; the Phase 0 code gate stays closed. |

## Decisions and limitations

- Public-web research cannot establish current active supply, local usage, service quality, legal compliance, or truth of platform marketing claims.
- Sparse or ambiguous Bangladesh products use `M`/`L`, `Unknown`, and `ASSUMPTION` instead of fabricated detail.
- Facebook/private groups, RUET/RU behaviour, tutor placement, and broker economics require P0-RES-03/P0-RES-04 field evidence.
- No account signup, app installation, paid transaction, interview, or field observation occurred.
- Turso/libSQL is recorded as the owner-selected database direction, but was not connected in this task. Its non-secret URL may be retained; the supplied credential was not stored and must be rotated because it was exposed in chat.
- A pre-Phase-1 ADR must reconcile libSQL with the guide's PostgreSQL/Prisma, geospatial, migration, and transaction requirements.

## Next task

P0-RES-02 — append the prescribed `Yes / Partial / No / Unknown` capability gap matrix to `docs/competitor-analysis.md`.

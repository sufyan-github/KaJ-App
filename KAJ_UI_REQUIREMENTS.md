# KAJ — USER REQUIREMENTS & UI RECOMMENDATIONS
### Research-backed companion to `KAJ_BUILD_GUIDE.md` (PART F expands into this document)

> **Version 1.0** · Owner: Abu Sufyan · Market: Rajshahi, Bangladesh
> **How to use with Codex:** this file defines *what the user needs* and *how the interface must
> behave*. `KAJ_BUILD_GUIDE.md` defines *how to build it*. Every requirement here has an ID
> (`UR-*`, `NFR-*`, `R-*`) that must be referenced in the screen spec, the widget test, and the
> QA checklist. A screen is not "done" until every requirement mapped to it in PART 8 passes.

---

## TABLE OF CONTENTS

| Part | Contents |
|---|---|
| **1** | Evidence base — what the research says and what it forces us to do |
| **2** | User requirements (functional, by role) + non-functional requirements |
| **3** | Job stories with acceptance criteria |
| **4** | UI recommendations (R-001 → R-120), screen family by screen family |
| **5** | Bangla-first & low-literacy design system |
| **6** | Design token deltas (corrections to build-guide PART F2) |
| **7** | Usability testing protocol + UX metrics with targets |
| **8** | Traceability matrix: requirement → screen → phase → test |
| **9** | Sources |

---
---

# PART 1 — EVIDENCE BASE

Each finding is stated, then converted into a **design consequence**. Codex must not "improve on"
these consequences; they are the reason the UI is shaped the way it is.

## 1.1 Onboarding is where the product is won or lost

| Finding | Source | Design consequence for KAJ |
|---|---|---|
| Every additional pre-value screen drops onboarding completion by ~10–15%; splash, carousels, permission prompts and sign-up all count | vmobify (2026) | **Hard budget: max 6 screens** from launch to first value. Splash counts. Tour counts. |
| 70–80% of new users are lost in the first 3 days; the cause is usually onboarding, not the product | aaronmallen (2026) | Time-to-first-value is a tracked KPI, not a nice-to-have (see PART 7). |
| Median day-1 retention across categories ≈25% | AppsFlyer, via UXCam (2026) | Do not celebrate installs. Track D1/D7 activation per role. |
| Strongest flows run 60–120 seconds end to end | aaronmallen (2026) | **Target: worker onboarding ≤ 90 s, poster onboarding ≤ 60 s.** |
| Onboarding is not a tutorial; it must deliver a *first win* | aaronmallen (2026) | Worker's first win = seeing 3 real nearby jobs. Poster's first win = a published job. |
| Progressive disclosure + a skip option on every non-essential step; forced steps cause abandonment | Eleken, Appcues, Plotline (2026) | Every profile step after phone verification is skippable and resumable. |
| Permissions must be primed — never request without explaining the benefit | Appcues, designstudiouiux (2026) | Location, notification, camera each get a rationale sheet **before** the OS dialog. |
| Empty states are the riskiest screens; personalised action prompts in empty states lift early retention on their own | vmobify (2026) | Empty states are first-class deliverables with their own specs and tests. |

## 1.2 Two-sided marketplaces have a structural UX conflict

| Finding | Source | Design consequence |
|---|---|---|
| Buyers and sellers have different mental models and success metrics; neither side may be treated as secondary | lowcode.agency (2026) | Two distinct home screens, two navigation sets, two onboarding paths — one account. |
| Demand side wants speed and trust; supply side wants visibility and control | Purrweb (2026) | Poster UI optimises *decision speed*; worker UI optimises *opportunity visibility + schedule control*. |
| Five core patterns every marketplace needs: multi-attribute search/filter, persistent trust indicators, dual dashboards, streamlined transaction, real-time messaging | Purrweb (2026) | All five are MVP scope. None may be deferred. |
| Trust signals are decision-making inputs, not decoration; their *placement* determines completion | lowcode.agency (2026) | Trust block appears **above the fold** on every card and profile — never in a tab the user must open. |
| Thin inventory must be handled honestly; falsely curated empty categories are worse than sparse ones | lowcode.agency (2026) | Never pad the feed with stale or fake jobs. Say "3 jobs near you" if there are 3. |
| Push notification is the single strongest reason a marketplace needs an app | MobiLoud (2026) | Notification UX is a core feature with its own spec, not a settings afterthought. |

## 1.3 Designing for first-time / low-literacy / low-connectivity users

| Finding | Source | Design consequence |
|---|---|---|
| Minimise text input; eliminate hierarchies understood only through language; many users navigate by symbolic/visual literacy | Google Design (NBU) | Icon + label everywhere; pickers over free text; photo-first job categories. |
| Users may not know patterns designers assume — including what "swipe" means | uxspot / NBU | **No gesture-only affordances.** Every action has a visible button. |
| Show offline state with both an icon *and* the word "offline"; describe no-connectivity in plain text | NBU offline guidance | `KajOfflineBanner` shows icon + Bangla text + queued-action count. |
| Voice/audio input assists low-literacy users | NBU research, SARAL guidelines | Voice input on: search, job description, chat. Phase 12, but the field affordance is designed in from day 1. |
| Multilingual reality — language choice must be explicit and changeable | NBU | Language screen is step 1; language switch is in Settings **and** in the profile header. |
| ~49% individual internet use; ~72% household smartphone ownership (BBS 2025) | BBS / BSS | Assume the phone is sometimes **shared**. Never auto-login without a visible account identity. |
| bKash: ~75M registered customers, ~75% MFS share, ~379k agents | ADB via Daily Star | Payment UI is MFS-and-cash mental model first; card patterns are foreign and must not lead. |

## 1.4 Typography & platform

| Finding | Source | Design consequence |
|---|---|---|
| Minimum 16px body; line height ≥1.5 for body text | Toptal, USWDS, uxdt.nic.in | Body 16sp (raised from 15 in build-guide F2 — see PART 6). |
| Bengali has intricate curves, ligatures and conjunct characters requiring precise rendering | Bangla typography sources | Bangla line height 1.7×; never tight tracking; test conjuncts (ক্ষ, জ্ঞ, ন্ত্র) in every component. |
| ~4 font sizes are enough for most interfaces | learnui.design | Type scale capped at 7 roles, 4 in common use. |
| M3 Expressive enforces the 48dp minimum touch target more consistently; headline weights moved to Bold | suridevs (2026) | 48dp floor is a lint rule, not a guideline. |
| Material 3 is default in Flutter since 3.16; M2 support is being deprecated | Flutter docs | `useMaterial3: true`, `ColorScheme.fromSeed`, `NavigationBar` (not `BottomNavigationBar`). |

---
---

# PART 2 — USER REQUIREMENTS

**Notation:** `M` = MVP mandatory · `S` = should have · `L` = later phase.
Every requirement is written to be **testable**. "The system shall…" statements only.

## 2.1 Global requirements (all users)

| ID | Requirement | Pri | Verify by |
|---|---|---|---|
| UR-001 | The system shall allow a user to register and log in using only a Bangladeshi mobile number and an SMS code — no email, no password required. | M | E2E J1 |
| UR-002 | The system shall present the interface in Bangla by default and allow switching to English at any time without data loss or restart. | M | Widget + manual |
| UR-003 | The system shall allow one account to act as both work-poster and worker, switchable in ≤2 taps, without a second registration. | M | E2E |
| UR-004 | The system shall never require a user to complete a profile section before browsing; profile completion shall be resumable and skippable. | M | E2E |
| UR-005 | The system shall explain, in plain Bangla, why each device permission is needed *before* the OS dialog appears, and shall remain usable if it is denied. | M | Manual matrix |
| UR-006 | The system shall show, on every screen with network dependency, whether data is live, cached, or unavailable. | M | Manual (airplane mode) |
| UR-007 | The system shall never lose user-entered data when the app is backgrounded, killed, or loses connectivity. | M | E2E kill-test |
| UR-008 | The system shall let a user report or block any other user from any screen where that user appears. | M | E2E J6 |
| UR-009 | The system shall let a user export their data and request deletion from Settings. | M | Integration |
| UR-010 | The system shall display all monetary values with the ৳ symbol and locale-appropriate numerals, and shall never display a fractional taka. | M | Unit + widget |
| UR-011 | The system shall function on a 2 GB RAM Android 10 device on a 3G connection without freezing or crashing. | M | Device matrix |
| UR-012 | The system shall provide a visible, tappable route to human support (call/WhatsApp) from Help and from every dispute-capable screen. | M | Manual |
| UR-013 | The system shall support voice input for search, job description, and chat message composition. | L (P12) | Manual |

## 2.2 Worker (supply side)

| ID | Requirement | Pri | Verify by |
|---|---|---|---|
| UR-101 | The system shall show a worker at least 3 real, nearby, relevant jobs within 90 seconds of first launch, or an honest empty state explaining why it cannot. | M | E2E J1 |
| UR-102 | The system shall let a worker declare weekly availability using presets (e.g. "Evenings", "Weekends", "After 6 PM") in ≤4 taps, with a detailed editor available. | M | Widget + E2E |
| UR-103 | The system shall never show a worker a job that conflicts with a confirmed assignment, unless explicitly filtered for. | M | Unit (D4) |
| UR-104 | The system shall display, for every job in the feed: pay, date/time, duration, distance, and category — without opening the job. | M | Widget |
| UR-105 | The system shall explain why a job was recommended, in ≤3 short reasons the worker can read. | M | Widget + API `explain` |
| UR-106 | The system shall let a worker apply to a fixed-price job in ≤2 taps from the job detail screen. | M | E2E |
| UR-107 | The system shall let a worker send a price proposal only where the poster marked the job negotiable. | M | Integration |
| UR-108 | The system shall show a worker the status of every application, with the time since it was sent and the expected response window. | M | Widget |
| UR-109 | The system shall show a worker a single schedule view containing all confirmed, upcoming, and in-progress work. | M | E2E |
| UR-110 | The system shall show the exact work address to the assigned worker only after confirmation, and shall provide one-tap navigation and one-tap call/message. | M | Integration (D10) |
| UR-111 | The system shall show a worker exactly what they will earn after any platform fee, before they apply. | M | Unit + widget |
| UR-112 | The system shall let a worker set a maximum travel distance and shall not notify them about work beyond it. | M | Unit (D5) |
| UR-113 | The system shall let a worker mark themselves available/unavailable for immediate work with one tap. | S | Widget |
| UR-114 | The system shall warn a worker, before they cancel, of the exact consequence to their reputation and payment. | M | E2E J4 |
| UR-115 | The system shall present a worker's reputation as understandable facts (jobs completed, completion %, typical reply time) rather than an opaque score. | M | Schema test (D7) |
| UR-116 | The system shall never make a worker pay to become visible or to apply to a basic job. | M | Policy review |
| UR-117 | The system shall let a student worker record institution and study-compatible availability, and shall not expose institution details publicly without consent. | S | Integration |
| UR-118 | The system shall record check-in/check-out for physical jobs when enabled, and shall work if GPS is unavailable (manual/poster confirmation fallback). | L (P10) | E2E |

## 2.3 Poster / customer (demand side)

| ID | Requirement | Pri | Verify by |
|---|---|---|---|
| UR-201 | The system shall let a first-time poster publish a valid job in ≤3 steps and ≤3 minutes, without reading help text. | M | Usability test |
| UR-202 | The system shall pre-fill a sensible job title and description scaffold once a category is chosen. | M | Widget |
| UR-203 | The system shall validate a job before publishing and shall point the poster directly at any missing field. | M | E2E |
| UR-204 | The system shall autosave a draft after every step and restore it after an app kill. | M | E2E kill-test |
| UR-205 | The system shall show a budget hint **only** when derived from ≥30 real completed jobs in the same category, area and job type; otherwise it shall show nothing. | S | Unit (P12) |
| UR-206 | The system shall tell a poster what to expect after publishing (typical time to first application) using real platform data, or say nothing. | M | Integration |
| UR-207 | The system shall notify a poster of each application and shall show applicant trust signals (rating, jobs completed, verification, response rate, distance) in the list, without opening a profile. | M | Widget |
| UR-208 | The system shall let a poster compare up to 3 applicants side by side on identical attributes. | S | Widget |
| UR-209 | The system shall let a poster hire in ≤2 taps from the applicant list, with a confirmation sheet stating price, time and cancellation terms. | M | E2E J3 |
| UR-210 | The system shall never reveal the poster's exact address or phone number before the worker is confirmed. | M | Integration (D10) |
| UR-211 | The system shall show the live status of an active job with a plain-language timeline. | M | Widget |
| UR-212 | The system shall require an explicit completion confirmation from the poster, and shall auto-confirm after a stated deadline with prior warning. | M | E2E + timers |
| UR-213 | The system shall let a poster rehire a previous worker in ≤2 taps with the previous terms pre-filled. | M | E2E |
| UR-214 | The system shall let a poster create a repeating job (e.g. every Friday) and manage occurrences individually. | L (P11) | E2E |
| UR-215 | The system shall show the total the poster pays and any fee, itemised, before any commitment. | M | Unit + widget |
| UR-216 | The system shall let a poster cancel with a clear statement of penalty and refund before confirming. | M | E2E J4 |

## 2.4 Business user

| ID | Requirement | Pri | Verify by |
|---|---|---|---|
| UR-301 | The system shall let a business post a repeating shift and request multiple workers in one action. | L (P11) | E2E |
| UR-302 | The system shall show a weekly roster of who is working which shift. | L (P11) | Widget |
| UR-303 | The system shall produce an attendance record derived from work sessions, exportable as a file. | L (P11) | Integration |
| UR-304 | The system shall let a business maintain a favourite worker pool and offer shifts to that pool first. | L (P11) | E2E |
| UR-305 | The system shall let a business add a second manager with restricted permissions. | L (P11) | Authz matrix |

## 2.5 Admin / operations

| ID | Requirement | Pri | Verify by |
|---|---|---|---|
| UR-401 | The system shall let a support operator find any job and see its full status history with actor and reason. | M | Playwright |
| UR-402 | The system shall let an operator move a stuck job to a valid state with a mandatory reason, recorded in the audit log. | M | Playwright |
| UR-403 | The system shall surface a live list of jobs with no applications after a configurable interval, for concierge intervention. | M | Playwright |
| UR-404 | The system shall let an operator approve or reject verification with a reason returned to the user. | M | Playwright |
| UR-405 | The system shall let an operator change fees, matching weights and policies without a code deploy, with a diff preview and audit entry. | M | Playwright |
| UR-406 | The system shall never allow an automated ban; every account restriction shall require a human action. | M | Code review + test |

## 2.6 Non-functional requirements

| ID | Requirement | Target | Verify by |
|---|---|---|---|
| NFR-01 | Cold start to first frame (release build, mid-tier Android) | ≤ 2.5 s | Perf test in CI |
| NFR-02 | Feed screen scroll | 0 frames > 16 ms | Profile run |
| NFR-03 | APK size (arm64, split per ABI) | ≤ 25 MB | CI gate |
| NFR-04 | Feed API response (20 items) | ≤ 60 KB gzipped, p95 < 300 ms | Load test |
| NFR-05 | Any user action gives visible feedback | ≤ 100 ms | Manual |
| NFR-06 | Data used in a typical 10-minute session | ≤ 3 MB | Manual measurement |
| NFR-07 | App usable at textScaleFactor 2.0 with no clipping | 100% of screens | Golden tests |
| NFR-08 | Colour contrast | ≥ 4.5:1 body, ≥ 3:1 large/icons | Automated audit |
| NFR-09 | Minimum touch target | 48 × 48 dp | Lint rule + audit |
| NFR-10 | Smallest supported width | 320 dp | Golden tests |
| NFR-11 | Offline: read cached feed, queue writes, no duplicates | Always | E2E airplane mode |
| NFR-12 | Crash-free sessions | ≥ 99.5% | Sentry |
| NFR-13 | i18n coverage | 100% of strings in bn + en, 0 missing keys | Build-time check |
| NFR-14 | No PII (phone, address, document key) in logs or analytics | 0 occurrences | Automated scan |

---
---

# PART 3 — JOB STORIES WITH ACCEPTANCE CRITERIA

Format: *When [situation], I want to [motivation], so I can [expected outcome].*
Job stories are used instead of "As a user…" because the **situation** is what drives the design.

## JS-01 — Student finds evening work
> **When** I finish class at 4 PM and have nothing to do until 10 PM, **I want to** see only work
> I can actually reach and finish tonight, **so I can** earn something today without missing study time.

```gherkin
GIVEN a worker with availability Sun–Thu 17:00–22:00 and a 5 km radius
WHEN  they open the app at 16:10
THEN  the home screen leads with jobs starting after 17:00 and ending before 22:00
AND   each card shows pay, start time, duration and distance without tapping
AND   any job conflicting with a confirmed assignment is excluded
AND   if fewer than 3 such jobs exist, the screen says so honestly and offers
      [Expand distance] [Change availability] [Add skills] — not a padded list
```

## JS-02 — Shop owner needs a helper tonight
> **When** my assistant does not show up and customers are arriving, **I want to** post the need in
> under two minutes and know whether anyone is coming, **so I can** stop worrying and serve customers.

```gherkin
GIVEN a first-time poster with a verified phone
WHEN  they tap [Post work] and choose "Shop assistant"
THEN  title and description are pre-scaffolded and editable
AND   date defaults to today, time to the next half-hour, duration selectable in one tap
AND   publishing takes ≤3 steps and ≤3 minutes measured in usability testing
AND   after publishing they see "Finding workers…" with a live applicant count
AND   they are told the platform's real median time-to-first-application, or nothing at all
```

## JS-03 — Household hires a stranger for the first time
> **When** I am letting an unknown person into my home, **I want to** see evidence that they are
> real and reliable, **so I can** decide without feeling reckless.

```gherkin
GIVEN a poster viewing an applicant
WHEN  the applicant card renders
THEN  verification level, rating with review count, jobs completed, completion %, typical reply
      time and distance are all visible without scrolling
AND   an unverified applicant is labelled honestly, not hidden and not flattered
AND   a new worker with no history is shown as "New worker" with whatever is verified, never
      with an invented rating
AND   tapping the name opens a full profile with reviews written by other posters
```

## JS-04 — Worker protects their time
> **When** someone wants to hire me for a slot I cannot make, **I want to** decline without
> damaging my standing, **so I can** stay in control of my schedule.

```gherkin
GIVEN a worker who received a hire request
WHEN  they open the confirmation screen
THEN  the deadline to respond is stated in plain words with a countdown
AND   [Decline] shows the consequence ("This does not affect your rating") before confirming
AND   declining reopens the job for the poster within 5 seconds and notifies them
```

## JS-05 — Either side hits trouble mid-job
> **When** the work is not what was agreed, **I want to** raise it inside the app with evidence,
> **so I can** avoid an argument and get a fair outcome.

```gherkin
GIVEN an assignment in CUSTOMER_REVIEW
WHEN  either party taps [There is a problem]
THEN  they choose from plain-language reasons, not legal categories
AND   photos and the existing chat are attached automatically as evidence
AND   both parties see the same timeline and the same stated response window
AND   payment (when enabled) is visibly frozen, with that fact stated on screen
```

## JS-06 — Poster wants the same person again
> **When** someone did a good job, **I want to** book them again without re-explaining anything,
> **so I can** stop searching.

```gherkin
GIVEN a completed job with a 4+ rating
WHEN  the poster opens it from history
THEN  [Book again] is the primary action
AND   it opens a pre-filled job addressed to that worker with the previous price and duration
AND   the worker receives a direct offer with a stated acceptance window, bypassing open applications
```

## JS-07 — A user with weak reading skills
> **When** I cannot read long Bangla text quickly, **I want to** understand the screen from icons,
> pictures and short labels, **so I can** use the app without asking my son for help.

```gherkin
GIVEN any primary screen
WHEN  it renders
THEN  every action has an icon AND a short label (≤3 Bangla words)
AND   categories are chosen from a picture grid, never a text-only dropdown
AND   no essential action requires a swipe, long-press, or hidden menu
AND   status is conveyed by icon + colour + text together, never colour alone
```

---
---

# PART 4 — UI RECOMMENDATIONS

> Each recommendation carries an ID, the evidence it derives from, and the screens it binds to.
> `[E1.1]` etc. refer to the PART 1 evidence tables.

## 4.1 Information architecture & navigation

```text
R-001  Two navigation sets, one account. The bottom bar changes with the active role mode; it
       never mixes worker and poster destinations.  [E1.2]
         WORKER   : কাজ (Home) · খুঁজুন (Jobs) · আবেদন (Applications) · সময়সূচি (Schedule) · প্রোফাইল
         POSTER   : হোম (Home) · পোস্ট (Post) · আমার কাজ (My jobs) · বার্তা (Messages) · প্রোফাইল
R-002  Max 5 destinations, labels ALWAYS visible (never icon-only). Bangla labels ≤ 2 words. [E1.3]
R-003  The role switch is a segmented control in the home app bar AND a row in Profile. Switching
       is instant, animated ≤250 ms, and preserves scroll position per role.
R-004  Use Material 3 `NavigationBar` (not BottomNavigationBar) with `useMaterial3: true` and
       `ColorScheme.fromSeed`.  [E1.4]
R-005  Depth limit: no screen is more than 3 taps from its role's home. Anything deeper is a
       design error and must be re-scoped.
R-006  Every screen has a visible back affordance in the app bar. Android hardware back is never
       the only way out.  [E1.3 — gesture literacy]
R-007  Deep links (kaj://job/, /application/, /assignment/, /chat/) open the target screen with a
       synthetic back stack to the role home — never into a dead end.
```

## 4.2 Onboarding — the 6-screen budget

```text
R-010  HARD LIMIT: 6 screens from cold launch to first value. Counted: splash, language, phone,
       OTP, role, one profile step. Anything else is deferred to contextual prompts.  [E1.1]
R-011  Screen order and content:
         1 Splash            ≤1.2 s, logo + one-line value prop in Bangla, no carousel
         2 Language          বাংলা (default, pre-selected) / English — big cards, not a dropdown
         3 Phone             number field + "why we need this" one-liner + terms link
         4 OTP               6 boxes, auto-read, 60 s resend countdown, "wrong number?" link
         5 Role              two large picture cards: "আমি কাজ খুঁজছি" / "আমার কাজ করাতে হবে"
                             + a small line: "পরে পরিবর্তন করা যাবে" (changeable later)
         6 First value       WORKER → location + 3 categories → immediately shows the live feed
                             POSTER → straight into Post work step 1
R-012  Everything else (photo, bio, skills detail, rates, availability detail, verification) is
       requested **contextually**, at the moment it unlocks value:
         - rate → asked on the first application to a paid job
         - availability → asked after the first feed view, framed as "get better matches"
         - photo → asked after the first application, framed as "posters hire profiles with photos"
         - verification → asked when applying to a category that requires it
       Each ask is a single bottom sheet with [Later] always present.  [E1.1 progressive disclosure]
R-013  A persistent, dismissible profile-strength card on Home shows the next single most valuable
       step with the concrete benefit ("Add availability → see 4× more matching jobs"). Never a
       nagging percentage ring with no explanation.
R-014  Permission priming: a rationale sheet precedes every OS dialog, in Bangla, stating the
       benefit and what happens if denied. Denied ≠ broken: location denied → area picker;
       notifications denied → in-app inbox with an unread badge.  [E1.1]
R-015  Every onboarding step is resumable. Killing the app mid-flow returns to the same step with
       inputs intact.  [UR-007]
R-016  No feature tour carousel. If guidance is needed, use a single contextual coach mark shown
       the first time a feature is approached, dismissible forever.  [E1.1]
R-017  Measure: `onboarding_step_view` / `onboarding_step_complete` per step, so drop-off is
       attributable to a screen. Review weekly during the pilot.
```

## 4.3 The job card — the most important component in the product

```text
R-020  A single `KajJobCard` is used in every list (feed, search, saved, history). One component,
       three density variants. Never a bespoke card.
R-021  Information priority, top to bottom (this order is fixed):
         1 PAY        largest element after the title — ৳500 · "৪ ঘণ্টার জন্য"
         2 WHEN       "আজ ৫টা–৯টা" — relative day words (আজ/আগামীকাল) before dates
         3 WHERE      "তালাইমারী · ১.৮ কিমি" — area name AND distance, always both
         4 TITLE      2 lines max, ellipsis
         5 TRUST      poster rating + verified badge + jobs posted  [E1.2 trust placement]
         6 MATCH      match % chip, top-right, only if ≥60
       Rationale: pay and time are the two decision inputs; distance is the hidden cost. [E1.2]
R-022  Card height ≤ 168 dp at textScale 1.0 so ≥3 cards are visible on a 5" screen without
       scrolling — the user must perceive choice immediately.
R-023  Card has exactly one tap target (the whole card) plus one optional save icon. No swipe
       actions.  [E1.3]
R-024  State badges rendered on-card: "আবেদন করেছেন" (applied) · "পূর্ণ" (filled) · "মেয়াদ শেষ"
       (expired) · "জরুরি" (urgent). Icon + text + colour together.  [JS-07]
R-025  Skeleton loader matches the final card layout exactly, so nothing jumps on load.
R-026  Images: category illustration only (small, cached, bundled). No remote hero images in the
       feed — they cost data and jank.  [NFR-04, NFR-06]
```

## 4.4 Worker home & feed

```text
R-030  Worker home sections, in order:
         Greeting + availability toggle ("এখন কাজের জন্য প্রস্তুত")
         → Today's schedule (only if non-empty)
         → "আপনার জন্য কাজ" (matched, max 5, with match chips)
         → "কাছাকাছি কাজ" (distance-sorted, max 5)
         → Profile-strength card (R-013)
       Any section with zero items is REMOVED, not shown empty — except when ALL are empty, in
       which case a single honest, actionable empty state replaces the body.  [E1.2]
R-031  Never pad the feed to look busy. Show the true count: "আপনার কাছে ৩টি কাজ আছে".  [E1.2]
R-032  Match reasons appear as up to 3 chips under the card title in the "for you" section only —
       "আপনার দক্ষতা", "১.৮ কিমি", "আপনার সময়ে". These map to `matchReasons[]` from the API. [UR-105]
R-033  Filters live in a bottom sheet with a visible applied-filter count on the trigger button.
       Applied filters also render as removable chips above the list. Reset is always one tap.
R-034  Sort options are named in outcome language: "সবচেয়ে মানানসই" (best match) · "কাছের আগে"
       (nearest) · "বেশি টাকা" (highest pay) · "নতুন আগে" (newest).
R-035  Pagination: 20 items, infinite scroll with a visible "আরও দেখুন" fallback button for users
       who do not discover scroll-loading.  [E1.3]
R-036  Pull-to-refresh is supplemented by a visible refresh action in the app bar. Gestures are
       never the only path.  [E1.3]
```

## 4.5 Job detail (worker view)

```text
R-040  Sticky bottom action bar containing the single primary action. It never scrolls away.
R-041  Above the fold, without scrolling: title, pay, when, where + distance, match chip.
R-042  Earnings transparency block, always present when a fee applies:
         "কাজের মূল্য ৳৫০০ · প্ল্যাটফর্ম ফি ৳৪০ · আপনি পাবেন ৳৪৬০"  [UR-111]
R-043  Poster trust block sits directly under the money block — before the description. Trust is a
       decision input, not an appendix.  [E1.2]
R-044  Location shown as an area circle on a static map preview; exact pin only after confirmation.
       A caption states this explicitly: "নিশ্চিত হওয়ার পর সঠিক ঠিকানা দেখানো হবে".  [UR-110]
R-045  Safety strip, always present, one line: "কাজ পেতে কাউকে টাকা দেবেন না।"  [UR-116]
R-046  Apply is 2 taps max: [আবেদন করুন] → confirm sheet showing pay, time, and what happens next
       → done. The confirm sheet doubles as the just-in-time rate/photo prompt if missing. [R-012]
R-047  After applying, the primary action is replaced by a status block with elapsed time and the
       expected response window — never by a disabled grey button with no information.  [UR-108]
```

## 4.6 Post work (create job)

```text
R-050  3 steps, each fitting one screen without scrolling at textScale 1.0 on a 5" device.
       Progress indicator "১/৩" always visible.  [UR-201]
R-051  Step 1 = category picture grid (2 columns, illustration + Bangla label), then a scaffolded
       title and description. Category choice pre-fills everything possible.  [E1.3, UR-202]
R-052  Step 2 = when + how much. Date offered as আজ / আগামীকাল / তারিখ বাছুন chips first, calendar
       second. Time as a range picker with live duration echo ("৪ ঘণ্টা").
R-053  Money input: numeric keypad, ৳ prefix, thousands separator, and a plain-language echo of the
       total commitment. Show a market range ONLY with ≥30 real comparable jobs, labelled with the
       sample size. Otherwise show nothing.  [UR-205 — never invent prices]
R-054  Step 3 = where + who. Area picker (searchable list) with an optional "আমার অবস্থান" button.
       Exact address field carries an inline privacy note.  [UR-210]
R-055  Preview screen renders the *actual worker-facing card* plus the full detail — "this is what
       workers will see". Validation problems appear as tappable rows that jump to the field. [UR-203]
R-056  Autosave a DRAFT after each step; exiting offers [খসড়া রাখুন] / [বাতিল করুন].  [UR-204]
R-057  Post-publish screen: "কর্মী খোঁজা হচ্ছে…" with a live applicant counter, an honest expectation
       line drawn from real data (or omitted), and [শেয়ার করুন] to push the job to WhatsApp/Facebook
       — because in a cold-start market the poster's own network is real supply.  [E1.2]
```

## 4.7 Trust & safety UI (the conversion layer)

```text
R-060  A single `KajTrustBlock` component renders the trust set everywhere: verification badges,
       rating + count, jobs completed, completion %, typical reply time, member since. Same order,
       same icons, every time.  [E1.2 — placement determines completion]
R-061  Trust appears above the fold on: applicant cards, worker profiles, poster blocks in job
       detail, and confirmation sheets. Never behind a tab.  [E1.2]
R-062  Honest treatment of thin history: a worker with 0 jobs shows "নতুন কর্মী" plus what IS
       verified. No invented stars, no "5.0 (0 reviews)".  [E1.2, UR-115]
R-063  Verification is a ladder shown as progress, not a binary: ফোন ✓ → পরিচয়পত্র → দক্ষতা.
       Each level states the benefit of climbing it.
R-064  Reputation is expressed in facts and badges: "৩৮টি কাজ · ৯৭% সম্পন্ন · সাধারণত ২ ঘণ্টায় উত্তর দেন".
       The internal reliability score is never rendered.  [UR-115]
R-065  Reviews display: overall stars, count, sub-scores as small bars, then newest 3 with the
       reviewer's first name + initial. Two-sided — worker reviews of posters are equally visible.
R-066  Safety guidance appears at the moment of risk, not in a policy page: on job detail, on
       confirmation, on first chat message, and before a home-address job.  [R-045]
R-067  Report and block are reachable in ≤2 taps from any profile, job, chat and assignment. The
       report flow is 3 taps: reason → optional detail → submit, with a confirmation of what
       happens next.  [UR-008]
R-068  Security/privacy explanations use plain Bangla and state the *user benefit*, never legal or
       technical jargon.  [E1.2 trust research]
```

## 4.8 Hiring, confirmation and live job

```text
R-070  Applicant list rows show the full trust block + proposed price + distance + [দেখুন]/[নিয়োগ].
       Hiring from the list is 2 taps including a confirmation sheet.  [UR-209]
R-071  Comparison view: up to 3 applicants, identical attribute rows, differences highlighted.
       Never more than 3 — beyond that, decision quality falls.  [UR-208]
R-072  The confirmation sheet is the contract in plain words: who, what, when, where (area), price,
       fee, what happens if either side cancels. One primary button. This sheet is the single most
       important trust moment in the product.
R-073  Live job screen uses a vertical timeline with plain-language states, the current step
       highlighted, and the next expected action named ("এখন: কর্মীর আসার অপেক্ষা")  [UR-211]
R-074  Contact affordances appear only after confirmation: [কল করুন] [বার্তা] [পথ দেখান] as three
       equal buttons.  [UR-110]
R-075  Completion confirmation states the deadline and the auto-confirm consequence up front:
       "৪৮ ঘণ্টার মধ্যে নিশ্চিত না করলে স্বয়ংক্রিয়ভাবে সম্পন্ন হবে।"  [UR-212]
R-076  Cancellation always shows a consequence preview screen before the destructive action, with
       the penalty in taka and reputation terms, and an [জরুরি অবস্থা] path.  [UR-114, UR-216]
```

## 4.9 Messaging & notifications

```text
R-080  Chat is job-scoped with a persistent header showing the job title, date and status — context
       prevents the "which job is this?" confusion that kills marketplace chat.  [E1.2]
R-081  Quick-reply chips for the 6 most common messages ("কখন আসবেন?", "আমি রওনা দিয়েছি", "ঠিক আছে",
       …) reduce typing for low-literacy and Bangla-keyboard-averse users.  [E1.3]
R-082  Image send is one tap with automatic compression; a visible sending/sent/failed state per
       message; failed messages are retryable, never silently dropped.
R-083  Off-platform payment nudge: an inline, non-blocking banner when a message matches a phone or
       payment-number pattern. It informs; it does not block, and message content is never shown to
       staff outside a dispute.  [D10 in build guide]
R-084  Notification content rule: every push states the concrete fact and the next action —
       "৳৫০০ · আজ ৫টা · তালাইমারী — আপনার জন্য নতুন কাজ", not "You have a new opportunity".  [E1.2]
R-085  Notification frequency: max 5 job alerts per day per worker, batched hourly; quiet hours
       22:00–08:00 with only selection/cancellation overriding. Over-notification is the fastest
       route to uninstall.  [E1.2]
R-086  Every notification type is individually switchable in a plain-language settings list, and the
       in-app inbox always carries everything even if push is denied.  [UR-005]
R-087  In-app notification rows are grouped by day, unread-highlighted, and each deep-links to the
       exact screen with a working back stack.  [R-007]
```

## 4.10 Empty, error, offline and loading

```text
R-090  Empty states are specified and tested per screen. Structure: illustration → one-line honest
       statement → cause (if known) → 1–2 concrete action buttons.  [E1.1]
R-091  Never zero, always next: an empty worker feed offers [দূরত্ব বাড়ান] [দক্ষতা যোগ করুন]
       [সময় পরিবর্তন করুন]. An empty applicant list offers [শেয়ার করুন] [সম্পাদনা] [সময় বাড়ান].
R-092  Error copy names the cause and the fix. Banned strings: "কিছু ভুল হয়েছে", "Something went
       wrong", "Error", a bare code, a blank screen, an unbounded spinner.  [UR-006]
R-093  Offline banner shows an icon AND the word "অফলাইন" AND the queued-action count. Cached
       content is labelled with its age ("৫ মিনিট আগের তথ্য").  [E1.3 — explicit offline guidance]
R-094  Queued writes (apply, message, review) show a "পাঠানো হবে" state and send automatically on
       reconnect, with idempotency preventing duplicates.  [UR-007, NFR-11]
R-095  Skeletons, not spinners, for any list or detail. Spinner only for actions <2 s inside a
       button. Any wait >5 s gets a progress message.
R-096  Every failed request has a retry affordance; retries are exponential and cancellable.
R-097  Destructive confirmations state the consequence in a sentence, and the confirm button is
       labelled with the verb ("বাতিল করুন"), never "OK"/"Yes".
```

## 4.11 Money UI

```text
R-100  Cash is a first-class, honestly-labelled payment method during the pilot — not a degraded
       fallback. The screen states who pays whom, when, and what the platform does/does not
       guarantee.  [E1.3 — MFS/cash mental model]
R-101  When online payment ships, MFS options lead the layout (bKash/Nagad-style flow), cards last.
       Never a card-first checkout.  [E1.3]
R-102  Every amount is itemised before commitment: job value, fee, net. Both sides see their own
       view of the same numbers.  [UR-111, UR-215]
R-103  Earnings screen separates "অপেক্ষমাণ" (pending) from "উত্তোলনযোগ্য" (available) with the
       release condition stated in words.
R-104  Bangla numerals are used for money and dates when locale = bn, with an accessible fallback;
       digits are never mixed within one number.  [PART 5]
R-105  No fractional taka is ever displayed. Poisha exist only in the backend.  [UR-010]
```

---
---

# PART 5 — BANGLA-FIRST & LOW-LITERACY DESIGN SYSTEM

## 5.1 Typography (supersedes build-guide F2 where they differ)

```text
FONTS
  Bangla : 'Noto Sans Bengali' (variable, subset to used glyphs, bundled — never a network font)
  Latin  : 'Inter'
  One family per script. No decorative Bangla display fonts — conjuncts break.  [E1.4]

SIZES (sp) — body raised to 16 per accessibility guidance  [E1.4]
  display 28 · h1 24 · h2 20 · h3 17 · body 16 · bodySmall 14 · caption 13 (minimum permitted)
  Never below 13 sp anywhere, including nav labels.

LINE HEIGHT — Bangla needs more than Latin because of conjuncts, matras and descenders  [E1.4]
  Latin  body 1.5 · headings 1.3
  Bangla body 1.7 · headings 1.45
  Implement as two TextTheme variants selected by locale, not a single shared theme.

OTHER
  Letter spacing: 0 for Bangla (never negative — it collides ligatures). Latin headings -0.2 max.
  Weights: 400 body / 600 emphasis / 700 headings. No thin or ultra weights.
  Max 4 sizes visible on any one screen.  [E1.4]
  Bangla text never uses ALL CAPS (meaningless) and never italics (poor rendering).
  Line length target 40–60 Bangla characters.
```

## 5.2 Conjunct & rendering test set (must appear in golden tests)

```text
Required glyph test string, rendered in every text style and every component:
  ক্ষ  জ্ঞ  ন্ত্র  স্ত্র  দ্ধ  ঙ্ক  র্্য  কৃ  বৃ  ঋ  ঐ  ঔ  ্র  ্য  ং  ঃ  ঁ
Required numeral test:  ০১২৩৪৫৬৭৮৯  ৳১,২৩,৪৫৬
Required mixed string:  "৳৫০০ · ৪ ঘণ্টা · RUET এলাকা · 1.8 km"
Assert: no clipping at textScale 2.0, no fallback-font substitution, no baseline drift.
```

## 5.3 Language, numerals and formatting rules

```text
L-01  bn is the default locale on first launch; the language screen pre-selects it.
L-02  Numerals follow the locale: bn → ০-৯ for money, dates, durations, counts. en → 0-9.
      Never mix scripts inside a single number.
L-03  Phone numbers, OTP codes, and anything the user will read aloud or type use Latin digits in
      both locales (people dial in Latin).
L-04  Dates use relative words first: আজ · আগামীকাল · পরশু, then "সোম, ১৮ আগস্ট".
L-05  Time uses 12-hour with Bangla period words: "বিকাল ৫টা", "রাত ৯টা".
L-06  Currency always "৳" prefix, thousands grouped in the Bangladeshi pattern (১,২৩,৪৫৬).
L-07  Banglish input must be accepted in search and chat without normalisation errors.
L-08  Untranslated strings are a build failure, not a fallback. 0 missing keys.  [NFR-13]
L-09  Translation register: everyday spoken Bangla, not formal/literary সাধু ভাষা. Test copy with
      three real target users before shipping any new flow.
```

## 5.4 Iconography & visual literacy

```text
I-01  Every icon carries a text label. Icon-only is permitted ONLY in the app bar for back/close.
      [E1.3 — symbolic literacy, unfamiliar patterns]
I-02  Categories are represented by consistent, culturally legible illustrations (a Rajshahi shop,
      a rickshaw, a tutor with a book) — not abstract glyphs.
I-03  Status uses icon + colour + text simultaneously. Colour alone is banned.  [NFR-08, JS-07]
I-04  No hidden gestures for essential actions: no swipe-to-delete, no long-press menus, no
      pull-only refresh, no horizontal carousels holding unique content.  [E1.3]
I-05  Photographs of real, local people (with consent) outperform generic stock illustration for
      trust screens. Never use stock imagery implying users the platform does not have.  [E1.2]
I-06  Voice input affordance (microphone + "বলুন") is designed into search, description and chat
      fields from day 1, even though the feature ships in P12.  [E1.3, UR-013]
```

## 5.5 Cognitive load rules

```text
C-01  One primary action per screen. It is the widest, lowest, highest-contrast element.
C-02  Max 5 choices presented at once; more requires search or progressive grouping.
C-03  Forms: max 5 fields per screen. Split rather than scroll.
C-04  Any number shown to a user is accompanied by its unit and meaning ("৳৫০০ — ৪ ঘণ্টার জন্য").
C-05  Jargon ban list, with required replacements:
        escrow → "টাকা নিরাপদে রাখা আছে"      · match score → "কতটা মানানসই"
        verification tier → "যাচাই সম্পন্ন"    · assignment → "নিশ্চিত কাজ"
        dispute → "সমস্যা জানান"               · take rate/commission → "প্ল্যাটফর্ম ফি"
C-06  Reading level target: a class-8 student can act on any primary screen without help. Verify
      in usability testing, not by opinion.
```

---
---

# PART 6 — DESIGN TOKEN DELTAS (corrections to KAJ_BUILD_GUIDE PART F2)

```text
CHANGE-01  body size 15 sp → 16 sp                     reason: accessibility minimum  [E1.4]
CHANGE-02  single line-height scale → per-script scale  reason: Bangla conjuncts       [E1.4]
CHANGE-03  caption minimum 13 sp enforced (was implied) reason: legibility floor
CHANGE-04  primary CTA height 52 dp; ALL interactive ≥48 dp becomes a LINT RULE, not a guideline
           reason: M3 Expressive enforces this and flags violations                    [E1.4]
CHANGE-05  add semantic status tokens (one per JobStatus) so chips, timelines and badges cannot
           drift apart across screens
CHANGE-06  add `elevationLow` only; drop multi-level shadows — cheaper on low-end GPUs [NFR-01/02]
CHANGE-07  corner radius: md 12 → 16 for cards and buttons, aligning with M3 Expressive [E1.4]
CHANGE-08  add `skeletonBase` / `skeletonHighlight` tokens so every loader is consistent
CHANGE-09  add `trustGreen`, `newUserNeutral`, `unverifiedAmber` — trust states need dedicated,
           non-alarming colours (an unverified worker is not an error)
CHANGE-10  define both light and dark ColorScheme from a single seed via ColorScheme.fromSeed to
           guarantee contrast compliance                                              [E1.4]
```

---
---

# PART 7 — USABILITY TESTING & UX METRICS

## 7.1 Test protocol (run before each phase exit gate, minimum 5 participants per role)

```text
RECRUIT (Rajshahi, real target users — never colleagues, never CS students only)
  2 × RUET/RU students · 1 × shop owner (Shaheb Bazar or Talaimari) · 1 × household decision maker
  · 1 × skilled tradesperson with low formal literacy. At least 2 participants must have never
  used a marketplace app.

METHOD
  Moderated, in Bangla, on the participant's OWN phone (not a test device), on mobile data.
  Think-aloud. The moderator gives the situation, never the steps.
  Record: time on task, taps, errors, points of hesitation >3 s, requests for help, verbatim quotes.

TASKS (worker)                                    SUCCESS CRITERIA
  T1 Sign up and find work you could do tonight   ≤90 s, unaided, ≥3 relevant jobs seen
  T2 Apply for one of them                         ≤2 taps from detail, no confusion about pay
  T3 Tell me what you would earn                   states the NET figure, unprompted
  T4 Set the days you can work                     ≤60 s using a preset
  T5 Say what happens if you cancel                states penalty correctly after reading

TASKS (poster)                                    SUCCESS CRITERIA
  T6 Post a job for tomorrow evening               ≤3 min, unaided, no invalid publish attempt
  T7 Choose between two applicants                 names ≥2 trust signals as the reason
  T8 Hire one                                      ≤2 taps, correctly states the total cost
  T9 Say what happens if nobody applies            states the real expectation set by the app
  T10 Explain when your address is shared          answers correctly: after confirmation

PASS BAR: ≥80% task success unaided, 0 critical errors (wrong money, wrong time, wrong person
hired, address exposed). Any critical error blocks the phase gate.
```

## 7.2 UX metrics with pilot targets

| Metric | Definition | Target |
|---|---|---|
| Onboarding completion | reached first-value screen / installs | ≥ 70% |
| Time to first value (worker) | launch → first feed with ≥1 relevant job | ≤ 90 s (median) |
| Time to first value (poster) | launch → job published | ≤ 5 min (median) |
| Worker activation | profile + availability + ≥1 application within 7 d | ≥ 45% |
| Poster activation | ≥1 published job within 7 d | ≥ 55% |
| Post-work completion rate | published / started wizard | ≥ 75% |
| Apply conversion | applications / job-detail views | ≥ 20% |
| Time to first application | publish → first application (median) | ≤ 2 h |
| Fill rate | jobs with a confirmed worker / published | ≥ 60% by week 8 |
| Job completion rate | COMPLETED / CONFIRMED | ≥ 85% |
| Repeat hire rate | posters hiring a previous worker within 60 d | ≥ 20% |
| Notification opt-out rate | disabled push / users | ≤ 15% |
| D1 / D7 retention | standard | ≥ 30% / ≥ 15% (vs ~25% D1 category median) |
| Support contact rate | conversations / completed jobs | ≤ 10% |
| Crash-free sessions | Sentry | ≥ 99.5% |

**Instrumentation rule:** every metric above must be computable from the events defined in
`/docs/analytics.md` before the pilot starts. A metric with no event is a metric that will not exist.

---
---

# PART 8 — TRACEABILITY MATRIX

| Requirement | Screens | Build-guide phase | Primary test |
|---|---|---|---|
| UR-001, UR-002 | S01–S04 | P1 | E2E J1 · widget locale test |
| UR-003 | S06, S50, home shells | P2 | E2E role switch |
| UR-004, R-010→R-017 | S05–S10 | P1–P2 | Usability T1/T6 · funnel events |
| UR-005, R-014 | permission sheets, S07 | P2 | Manual permission matrix |
| UR-006, R-093/094 | all | P1 (core), all | E2E airplane mode |
| UR-007, R-056 | S30–S33, S15 | P3 | E2E kill-test |
| UR-101, R-030/031 | S11, S12 | P4 | E2E J1 · empty-state widget test |
| UR-102 | S09, S19 | P2 | Widget · usability T4 |
| UR-103 | S12 feed query | P4 | Unit (D4) |
| UR-104, R-020→R-026 | KajJobCard | P3 | Golden test × 3 locales/scales |
| UR-105, R-032 | S12, S14 | P4 | API explain test |
| UR-106, R-046 | S14, S15 | P3 | E2E · usability T2 |
| UR-108, R-047 | S17 | P3 | Widget |
| UR-110, R-044/074 | S14, S20, S40 | P3/P5 | Projection integration test |
| UR-111, R-042/102 | S14, S22, S42 | P3/P9 | Unit + widget · usability T3 |
| UR-114, R-076 | S20, S40 | P5 | E2E J4 · usability T5 |
| UR-115, R-064 | S24, S28 | P6 | Schema test (no score exposed) |
| UR-201→204, R-050→057 | S30–S33 | P3 | Usability T6 · E2E |
| UR-205, R-053 | S31 | P12 | Unit (data threshold) |
| UR-207/208, R-070/071 | S36, S37 | P3/P4 | Widget · usability T7 |
| UR-209, R-072 | S36, S39 | P5 | E2E J3 · usability T8 |
| UR-211, R-073 | S40 | P5 | Widget |
| UR-212, R-075 | S41 | P5 | E2E + timer tests |
| UR-213, JS-06 | S23, S34 | P11 | E2E |
| UR-301→305 | business screens | P11 | E2E |
| UR-401→406 | admin | P8 | Playwright |
| R-060→R-068 | KajTrustBlock, S24, S36, S39 | P2/P4 | Golden + usability T7/T10 |
| R-080→R-087 | S46–S48 | P4/P7 | E2E J6 · notification tests |
| R-090→R-097 | all | every phase | Per-screen empty/error widget tests |
| R-100→R-105 | S22, S42 | P9 | Unit + widget |
| PART 5 (all) | all | P1 onward | Golden glyph tests + i18n build check |
| NFR-01→14 | all | P14 (enforced from P1) | CI gates + device matrix |

---
---

# PART 9 — SOURCES

```text
Onboarding & retention
  vmobify — App Onboarding Best Practices: Cut Drop-Off & Churn (Jun 2026)
    https://vmobify.com/blog/app-onboarding-best-practices
  Aaron Mallen — Mobile App Onboarding Flow That Reduces Drop-Off (Jul 2026)
    https://www.aaronmallen.com/2026/07/22/how-to-design-a-mobile-app-onboarding-flow-that-reduces-drop-off/
  Eleken — Mobile App Onboarding Best Practices 2026
    https://www.eleken.co/blog-posts/mobile-app-onboarding-best-practices
  Appcues — Essential guide to mobile user onboarding (Jun 2026)
    https://www.appcues.com/blog/essential-guide-mobile-user-onboarding-ui-ux
  Plotline — Best Mobile App Onboarding Examples (2026)
    https://www.plotline.so/blog/mobile-app-onboarding-examples
  UXCam — Apps with great user onboarding / AppsFlyer retention benchmark (2026)
    https://uxcam.com/blog/10-apps-with-great-user-onboarding/
  Design Studio UI/UX — Mobile App Onboarding Best Practices (2026)
    https://www.designstudiouiux.com/blog/mobile-app-onboarding-best-practices/

Marketplace UX
  lowcode.agency — Marketplace UI/UX Design Best Practices (May 2026)
    https://www.lowcode.agency/blog/marketplace-ui-ux-design-best-practices-full-guide
  Purrweb — Marketplace UI/UX Design Best Practices for Better Conversion (Apr 2026)
    https://www.purrweb.com/blog/marketplace-ux-ui-design/
  MobiLoud — How to Build a Marketplace App (2026)
    https://www.mobiloud.com/blog/how-to-build-a-marketplace-app
  Bolder Apps — Marketplace App Development in 2026 (architecture & two-sided complexity)
    https://www.bolderapps.com/blog-posts/marketplace-app-development-in-2026-architecture-cost-and-two-sided-complexity
  Baymard — Mobile UX Trends 2026
    https://baymard.com/blog/mobile-ux-ecommerce

Next Billion Users / low-literacy design
  Google Design — UX Design for the Next Billion
    https://design.google/library/connectivity-culture-and-credit
  uxspot — Google's Next Billion User Initiative (Jun 2026)
    https://uxspot.io/nbu/
  Rahighi — How to Design for the Next Billion Users
    https://rahighi.ir/blog/how-to-design-for-the-next-billion-users-nbu/
  ACM CSCW — Actionable UI Design Guidelines for Smartphone Applications Inclusive of
    Low-Literate Users (SARAL framework)   https://dl.acm.org/doi/10.1145/3449210
  ACM DEV — Mobile phone use within low-literate rickshaw-puller communities, urban Bangladesh

Typography & platform
  Toptal — Mobile Typography: Font Usage Tips and Best Practices (May 2026)
    https://www.toptal.com/designers/typography/typography-for-mobile-apps
  USWDS — Typography (line height / measure)
    https://designsystem.digital.gov/components/typography/
  India Design System (uxdt.nic.in) — Typography guidelines
  learnui.design — Font size guidelines
  Flutter — Material Design for Flutter (M3 default since 3.16)
    https://docs.flutter.dev/ui/design/material
  Suridevs — Material 3 Expressive: components & 48dp enforcement (May 2026)
    https://www.suridevs.com/blog/posts/google-material-3-expressive-android-16/
  Supercharge — Material 3 Expressive overview (Jun 2026)
    https://supercharge.design/blog/material-3-expressive

Bangladesh market context
  BSS / BBS ICT Access and Use Survey 2025-26 — individual internet use 48.9%,
    household smartphone ownership 72.4%   https://www.bssnews.net/news/343905
  DataReportal — Digital 2026: Bangladesh   https://datareportal.com/reports/digital-2026-bangladesh
  The Daily Star / ADB — internet penetration 53%; bKash 75M customers, ~75% MFS share,
    ~379k agents   https://www.thedailystar.net/news/bangladesh-trails-regional-peers-53-internet-penetration-4087271
  Future Startup — State of Bangladesh's Digital Economy (Feb 2026)
    https://futurestartup.com/2026/02/23/the-state-of-bangladeshs-digital-economy-at-the-beginning-of-2026/
  AMTOB — industry statistics (Apr 2026)   https://www.amtob.org.bd/home/industrystatics
```

> **Note on sources:** figures above are third-party reported and were current as of August 2026.
> Re-verify any number before putting it in an investor deck or a public claim. Nothing in this
> document authorises displaying an unverified statistic inside the product.

---

## HOW THIS DOCUMENT FEEDS CODEX

```text
1. Before any screen task, Codex reads: this file PART 4 (relevant section) + PART 5 + PART 6,
   plus KAJ_BUILD_GUIDE PART F.
2. The screen spec at /docs/ui/<S##>.md must list the UR-/R- IDs it satisfies.
3. Widget tests are named after the requirement they prove, e.g.
   `job_card_shows_pay_time_distance_without_tap (UR-104, R-021)`.
4. At each phase exit gate, run the PART 7 usability protocol and the PART 8 traceability check.
   An unsatisfied `M` requirement blocks the gate.
```

*END OF USER REQUIREMENTS & UI RECOMMENDATIONS*

# KAJ — PRE-BUILD PLANNING GAPS
### What still has to be decided, obtained, or budgeted before/alongside the build

> Third document in the set. Companion to `KAJ_BUILD_GUIDE.md` (how to build) and
> `KAJ_UI_REQUIREMENTS.md` (what users need). **This one covers everything that is not code**
> and that will stop the launch if it is discovered late.
> Version 1.0 · Researched August 2026 · Owner: Abu Sufyan
>
> ⚠️ **Nothing here is legal, tax, or financial advice.** Every item marked `[LEGAL]` needs
> sign-off from a Bangladeshi lawyer or chartered accountant before you act on it. Regulation in
> this space changed twice in the last 12 months; re-verify every citation before relying on it.

---

## TABLE OF CONTENTS

| Part | Contents |
|---|---|
| **0** | Executive summary — 14 gaps, ranked by what breaks |
| **1** | Legal & regulatory plan (entity, DBID, data protection, labour, consumer, cyber) |
| **2** | Payments & money — the licensing wall and how to route around it |
| **3** | Identity & verification — what you actually can and cannot verify |
| **4** | Vendor, infrastructure & cost plan |
| **5** | Team, capacity & the single-founder problem |
| **6** | Release & distribution plan (Play Store gates) |
| **7** | Trust, safety & incident operations |
| **8** | Content, data & asset plan |
| **9** | Funding, unit economics & runway |
| **10** | Measurement, kill criteria & decision calendar |
| **11** | Risk register additions |
| **12** | T-minus master checklist |
| **13** | Open questions requiring professional advice |
| **14** | Sources |

---
---

# PART 0 — EXECUTIVE SUMMARY: THE 14 GAPS

| # | Gap | Severity | What breaks if ignored | Must resolve by |
|---|---|---|---|---|
| G1 | **No legal entity + trade licence** | 🔴 Blocker | No payment gateway, no masked SMS, no DBID, no bank account, no contracts | Before pilot |
| G2 | **Payment licensing reality not designed for** | 🔴 Blocker | Holding user funds may require a Bangladesh Bank licence you will not get as a startup | Before any money feature |
| G3 | **Worker payout mechanism undefined** | 🔴 Blocker | Gateways *collect* money well; *disbursing* to 300 workers is a separate, harder problem | Before Phase 9 |
| G4 | **Data protection compliance (PDPA 2026)** | 🔴 High | New statute with extraterritorial reach, consent, localisation and children's-data rules; penalties are turnover-based | Design now, comply before May 2027 |
| G5 | **Identity verification is not actually available to you** | 🟠 High | The NID API is gated to Bangladesh Bank-regulated entities; your "verified" badge has no engine | Before trust features |
| G6 | **Play Store publishing gates** | 🟠 High | New personal accounts need 12 testers × 14 continuous days; org accounts need a D-U-N-S number | 8 weeks before launch |
| G7 | **Labour-law exposure from the 2026 amendment** | 🟠 High | Platform/gig workers were brought into the trade-union definition; your ToS and control mechanics matter | Before scale |
| G8 | **No cost model / runway** | 🟠 High | SMS, hosting, and ops have real per-user costs; you cannot price a fee you have not modelled | Before pilot |
| G9 | **No operations staffing plan** | 🟠 High | The MVP explicitly depends on concierge ops; nobody is assigned to do it | Before pilot |
| G10 | **Minor-safety policy undefined** | 🟠 High | Students under 18 will sign up; profiling/ad rules for children are now statutory | Before public launch |
| G11 | **No content/asset production plan** | 🟡 Medium | Categories, area lists, illustrations, and Bangla copy are a multi-week job nobody scheduled | Before Phase 2 |
| G12 | **No incident & insurance position** | 🟡 Medium | One injury or theft at a job site with no stated position is an existential PR event | Before pilot |
| G13 | **Hosting/localisation choice unmade** | 🟡 Medium | Restricted personal data may need an in-country synchronised copy | Before production data |
| G14 | **No kill criteria** | 🟡 Medium | Founders keep building past the point the data said stop | Before pilot |

**Reading of the whole picture:** the *software* plan is complete. The *company* plan is not.
Roughly 60% of what stands between you and a working Rajshahi pilot is non-code.

---
---

# PART 1 — LEGAL & REGULATORY PLAN `[LEGAL]`

## 1.1 Entity structure — decide first, everything hangs off it

| Option | Reality | Fit for KAJ |
|---|---|---|
| **Sole proprietorship** | Not an RJSC registration at all — the City Corporation trade licence *is* the registration. Government cost commonly cited at ~৳4,000–8,000 for small commercial categories. No separate legal personality, personal assets exposed. | Fine for a 3-month research pilot with cash-only transactions. **Not** fine once you hold money or take investment. |
| **One Person Company (OPC)** | An RJSC company with limited liability but a **minimum paid-up capital reported around ৳25 lakh** — that alone rules it out for most student founders. | ❌ Rule out unless capital exists. |
| **Private Limited (Pvt Ltd)** | Standard startup vehicle. Core RJSC incorporation commonly completes in ~1–2 weeks; total small-company cost with trade licence, TIN and VAT typically cited around ৳20,000–30,000, plus annual accounting/audit from ~৳20,000/yr. Corporate tax from ~22.5%. | ✅ **Recommended** before any payment integration or investor conversation. |

**Post-incorporation stack you will be asked for repeatedly** (assemble it once, keep a folder):
```text
Certificate of Incorporation · MoA/AoA · Form XII · Trade Licence (Rajshahi City Corporation)
· e-TIN · VAT/BIN registration · company bank account · authorised-signatory letter
· company pad/letterhead · DBID (see 1.2) · office address proof
```
Every payment gateway, every SMS aggregator, and most partnerships require the trade licence and
company bank account. **This is the single most common startup delay in Bangladesh: 4–8 weeks of
paperwork discovered at the moment you wanted to integrate payments.** Start it in week 1.

## 1.2 Digital commerce registration (DBID) `[LEGAL]`

Under the Digital Commerce Operation Guidelines regime, digital commerce entities are expected to
obtain a **Digital Business Identification (DBID)** through the Ministry of Commerce / RJSC.
Reported adoption is poor (one legal source cites ~1,240 issued against ~8,852 applications),
which tells you the process is slow and finicky, not that it is optional.

**Actions:**
```text
[ ] Confirm with counsel whether a *services* marketplace (labour, not goods) falls inside the
    digital-commerce guideline scope, or outside it — this is genuinely ambiguous and matters
[ ] If in scope: apply for DBID immediately after trade licence
[ ] Note the 2026 draft Cross-Border Digital Trade Policy — relevant only if you ever serve
    non-BD users or take foreign ad spend; track it, do not act on a draft
```

## 1.3 Data protection — the PDPA 2026 `[LEGAL]` 🔴

This is the biggest new legal fact since your build guide was written.

**Timeline:** Personal Data Protection Ordinance promulgated November 2025 → amended February 2026
(localisation narrowed; MD imprisonment replaced with monetary fines) → **repealed and replaced by
the permanent Personal Data Protection Act, 2026 (Law 63 of 2026), passed by Parliament in April
2026.** Full enforcement of some provisions (including the Chief Data Officer requirement) reported
as activating around **May 2027**, i.e. ~18 months after gazette.

**What it requires that affects KAJ directly:**

| Requirement | KAJ implication |
|---|---|
| Explicit consent — voluntary, specific, informed, unambiguous, **withdrawable** | A blanket ToS checkbox is not sufficient. Build **granular, per-purpose consent records** with timestamps and a withdrawal path from day 1. This is a schema change, not a policy page. |
| Four-tier data classification (public/open, internal, confidential, restricted) | Classify every column in your Prisma schema. NID images, location traces, and phone numbers are not the same tier as a display name. |
| Localisation: at least one synchronised real-time in-country copy for **restricted** personal data and Critical Information Infrastructure data | Affects your hosting decision (Part 4). A foreign-only cloud may be non-compliant for some data. |
| Cross-border transfer of confidential/internal data only to jurisdictions with appropriate standards, with consent or contractual necessity | Affects Sentry, FCM, analytics, any foreign SaaS touching user data. Inventory them. |
| Children: parental/guardian consent; **prohibition on profiling, behavioural tracking and targeted advertising directed at minors**; restrictions on automated decisions about children's data | Your matching engine is an automated decision system. If under-18s can be workers, this is squarely relevant. See G10. |
| Data subject rights; breach notification; retention limits; Chief Data Officer / compliance lead | Your `/me/export` and `DELETE /me` endpoints (already specced) are necessary but not sufficient — you need a documented response process and a named person. |
| Extraterritorial application to anyone offering services to data subjects in Bangladesh | No escaping it by hosting abroad. |

**Actions (do these during Phase 1–2, not at the end):**
```text
[ ] Data inventory: every field, its tier, its purpose, its retention, its lawful basis
[ ] Consent architecture: consent_records table (purpose, version, granted_at, withdrawn_at, ip)
[ ] Rewrite privacy policy + consent copy in Bangla to the "specific and informed" standard
[ ] Vendor/processor list with a data-processing clause in each contract
[ ] Breach response runbook (detect → assess → notify → record) with a named owner
[ ] Designate a compliance lead now; formalise the CDO role before enforcement
[ ] Decide the under-18 position (Part 7) and implement age gating accordingly
```

## 1.4 Labour law — the 2026 amendment changed the ground `[LEGAL]` 🟠

The **Bangladesh Labour (Amendment) Act 2026** (passed April 2026, following the 2025 Ordinance)
expanded the definition of 'worker' and — critically for you — extended the definition under
s.175(1) for **trade union purposes to self-employed persons and individuals engaged through
digital labour platforms**. Commentary describes the current position as recognising gig workers
for union purposes but not for benefit entitlements, and explicitly flags that arrangement as
unstable and likely to be closed by later amendment or judicial interpretation.

Separately, Fairwork Bangladesh research has documented low pay, safety concerns (reported ~89% of
platform workers concerned about safety), and arbitrary deactivation without human review across
existing BD platforms. That is both an ethical warning and a reputational map of where you will be
attacked.

**What this means for KAJ's design — most of it you already do, so make it explicit:**
```text
[ ] Never deactivate an account by algorithm alone (already rule R in the build guide — now it is
    also a legal-direction hedge). Human review, stated reason, appeal path.
[ ] Publish the fee, and never change a worker's economics retroactively on an accepted job.
[ ] Do not exert employer-like control you do not need: don't mandate hours, don't penalise
    declining work, don't set prices unilaterally where the model is negotiable.
[ ] Written terms in Bangla that state the relationship plainly, drafted by counsel.
[ ] Track the ILO 2026 platform-work negotiations and the next BD amendment — assume protections
    expand, and design so that expansion is not an existential cost.
```

## 1.5 Consumer protection, cyber, and content `[LEGAL]`

```text
[ ] Consumer rights: DNCRP complaint exposure — publish a refund/cancellation policy and a
    complaint channel with stated response times (you already have the dispute engine; the
    published policy is the missing piece)
[ ] Cyber Security Ordinance 2025 — referenced by the PDPA for the CII definition; confirm with
    counsel whether any KAJ system is in scope (probably not at pilot scale) and what the incident
    reporting duties are
[ ] Content moderation duties for user-generated listings and chat — document your takedown SLA
[ ] Prohibited categories: confirm with counsel what a labour marketplace may not intermediate
    (e.g. anything requiring a licence you cannot verify; MLM is expressly out under the digital
    commerce guidelines)
```

## 1.6 Tax `[LEGAL]`

```text
[ ] e-TIN + corporate return; VAT/BIN registration and the correct VAT rate for a commission-based
    service — get this from a CA before you charge a single fee, because the fee you advertise
    must be VAT-coherent
[ ] Withholding obligations on payments to workers — unclear for micro-payments; ask a CA
[ ] Keep the ledger (already in the build guide) audit-ready from transaction #1; retrofitting
    accounting onto a marketplace is brutal
```

---
---

# PART 2 — PAYMENTS: THE LICENSING WALL 🔴

## 2.1 The uncomfortable finding

Your build guide describes an escrow-like flow: customer pays → platform holds → work completes →
platform releases to worker. **In Bangladesh, "platform holds money" is a regulated activity.**

Under the Payment and Settlement Systems Act 2024 and BPSSR 2014, Bangladesh Bank's Payment Systems
Department licenses **PSPs** (facilitating payments directly to customers — e-wallets, mobile
wallets) and **PSOs** (operating settlement systems — payment gateways, aggregators, where the
principal participant must be a scheduled bank). Reported timelines for authorisation run
**3–6 months minimum**, with capital adequacy requirements, AML/CFT frameworks, an ISMS, VAPT,
a settlement bank, escrow mandates, and a named CEO/CTO/CISO/MLRO. Only around ten PSO companies
were licensed as of the mid-2024 reporting period.

**Conclusion: you will not hold funds yourself at pilot stage. Do not design as if you will.**

## 2.2 The three viable models, in order of increasing regulatory weight

```text
MODEL A — CASH ON COMPLETION (pilot default, ship this)
  Money never touches KAJ. The app records the agreed amount, the completion confirmation,
  and the receipt. Platform fee is either waived or invoiced separately.
  ✅ No licence needed. ✅ Matches the local cash norm. ✅ Ships in Phase 3, not Phase 9.
  ❌ No payment protection → your dispute system and reputation layer carry all the trust load.
  ❌ Fee collection is manual and leaky → this is a *learning* period, not a revenue period.

MODEL B — COLLECT VIA A LICENSED PSO, PAY THE WORKER DIRECTLY
  Customer pays through SSLCommerz / aamarPay / ShurjoPay / PortWallet / Moneybag into the KAJ
  merchant account; KAJ then disburses to the worker. The *collection* side is solved by the
  licensed gateway. The *holding period* between collection and disbursement is the part to
  clear with counsel — a short settlement window framed as payment-for-services is different from
  operating an escrow product, but do not assume that on your own.
  Published economics (verify at contract time): MFS ~1.5–2%, cards ~2–2.5%, setup ৳4,000–25,000,
  settlement typically 1–3 business days. Trade licence + company bank account required.

MODEL C — PARTNER WITH AN MFS/PSO FOR DISBURSEMENT
  Use a provider's payout/disbursement product to push worker earnings to bKash/Nagad wallets.
  This is the only realistic path to paying 300 workers without manual bank transfers.
  ⚠️ THIS IS THE GAP NOBODY PLANS FOR: gateways are built to *collect* from many and settle to
  one merchant. Paying *out* to many individuals is a different product, with different KYC,
  different limits, and different pricing. Scope it explicitly with the provider BEFORE you
  promise workers in-app earnings.
```

## 2.3 Decision required before Phase 9

```text
[ ] Meet 3 gateways (SSLCommerz, aamarPay, ShurjoPay) with a written flow-of-funds diagram and
    ask each, in writing: (a) can we hold for 24–72h before release? (b) do you offer bulk
    disbursement to MFS wallets? (c) what KYC do our workers need? (d) what are the per-payout
    fees and daily limits? (e) what is the refund/chargeback process for a service (not a good)?
[ ] Take the answers to counsel and get a written opinion on whether Model B as described requires
    any Bangladesh Bank authorisation
[ ] Only then decide whether Phase 9 ships, or whether KAJ stays cash-first for 12 months
[ ] Whatever you choose: keep the ledger and payment state machine from the build guide even in
    cash mode, so switching models is a config change, not a rewrite
```

**Also note:** legal commentary on e-commerce compliance references escrow expectations and seller
KYC for marketplace platforms, and warns that some gateways have been blacklisted by Bangladesh
Bank for non-compliance. **Verify your chosen gateway's current licence status directly with
Bangladesh Bank's published PSO/PSP list before signing.**

---
---

# PART 3 — IDENTITY & VERIFICATION 🟠

## 3.1 The finding that breaks the "Verified" badge

Bangladesh's official NID verification gateway, **Porichoy** (porichoy.gov.bd, built with the
Election Commission / BNDA), is the canonical eKYC source — banks use it for Bangladesh Bank's
digital eKYC guideline. But at least one identity vendor states plainly that Porichoy access is
**licensed to Bangladesh Bank-regulated entities and approved domestic Payment System Operators
under bilateral data-sharing agreements**, and that Bangladesh does not expose a public
consumer-grade NID verification API to general vendors.

**Translation: as an unlicensed early-stage marketplace, you probably cannot verify an NID
against the government database.** Your build guide's `TrustLevel.IDENTITY` has no engine behind it.

## 3.2 The verification ladder you can actually build

```text
TIER 1 — PHONE (automatic)          OTP. You already have this. Real, cheap, meaningful.
TIER 2 — DOCUMENT (manual)          User uploads NID front/back + a selfie. A human operator
                                    compares them, checks the number's format/checksum, and
                                    approves. Honest label: "পরিচয়পত্র জমা দেওয়া হয়েছে ও যাচাই
                                    করা হয়েছে" (submitted and reviewed) — NOT "government
                                    verified", which would be a false claim.
TIER 3 — SOCIAL / INSTITUTIONAL     Student ID + institution email; employer letter; a reference
                                    from an already-verified user. Cheap, locally credible, and
                                    genuinely useful in a city where networks overlap.
TIER 4 — IN-PERSON (pilot only)     Your ambassador meets the worker on campus and verifies the
                                    physical NID. Records who verified, when, where. At 150–300
                                    workers this is not only feasible, it is a growth activity.
TIER 5 — API-BASED (later)          Once you have an entity + volume, evaluate a licensed
                                    intermediary. Get written confirmation of their lawful access
                                    path before paying anyone. Verify claims independently.
```

**Rules (add to the build guide's rule set):**
```text
V1. The UI must never imply government verification that did not occur. Label exactly what was done.
V2. Store NID images in the private bucket, watermark on admin view, auto-purge 90 days after
    approval, and log every access (already specced — now it is also PDPA-relevant).
V3. Never display an NID number, even partially masked, to another user.
V4. Manual verification decisions get a reviewer id, timestamp, and reason — this becomes your
    defence if a verified worker later causes harm.
```

## 3.3 Background checks

There is no accessible criminal-record check for a private platform in Bangladesh. **Do not imply
one.** Your safety position must rest on: identity documentation, two-sided reputation, category
gating, public-place guidance, reporting, and human review. Say that plainly in the safety page —
overclaiming here is both a legal risk and the fastest way to lose trust after a first incident.

---
---

# PART 4 — VENDOR, INFRASTRUCTURE & COST PLAN

## 4.1 Vendor decisions required (with what to check before signing)

| Need | Options | What to verify |
|---|---|---|
| **SMS / OTP** | BTRC-licensed A2P aggregators (Bulk SMS BD, MiMSMS, SMS Bangladesh/NAJJ, DOER, Zaman IT, sms.bd) | BTRC licence status · masking approval (needs trade licence + authorisation letter) · **OTP delivery latency and success rate per operator (GP/Robi/BL/Teletalk) — demand a trial** · API rate limits · fallback route · Unicode/Bangla support. Note BTRC guidance that promotional SMS must be in Bangla; transactional/OTP may be English. |
| **Payment gateway** | SSLCommerz · aamarPay · ShurjoPay · PortWallet · Moneybag · direct bKash/Nagad merchant | Current BB licence · disbursement capability (Part 2) · settlement window · refund process for services · sandbox quality |
| **Hosting** | Local BD provider (localisation-friendly) vs. regional cloud (Singapore/Mumbai) vs. hybrid | PDPA localisation for restricted data · latency to Rajshahi · backup/PITR · uptime history · payment in BDT |
| **Push** | Firebase Cloud Messaging | Cross-border data transfer inventory (PDPA) · no PII in payloads |
| **Object storage** | S3-compatible (local or regional) | Private buckets · signed URLs · lifecycle purge rules |
| **Error tracking** | Sentry (self-hosted option exists) | Scrubbing config so no PII leaves the country |
| **Maps** | Google Maps vs. OpenStreetMap/Mapbox | Cost at scale · offline tiles · Bangla labels for Rajshahi areas (check coverage before committing) |
| **Analytics** | Self-hosted (PostHog/Umami) preferred | Keeps behavioural data in your control — simpler PDPA story |

## 4.2 Illustrative monthly cost model (pilot scale)

⚠️ **These are planning placeholders using publicly advertised rates, not quotes.** Replace every
number with a real quote before you budget. Assumptions stated so you can change them.

```text
ASSUMPTIONS (pilot, month 3): 400 registered users · 250 active workers · 60 posters
                              · 120 jobs/month · 3 OTPs per user per month average

SMS
  OTP + critical alerts ≈ 1,500 SMS/month × ~৳0.30       ≈  ৳450
  (advertised rates seen: ~৳0.25–0.31/SMS; masking costs more than non-masking)
  ⚠️ SMS is the cost that scales with *signups*, not revenue. At 10,000 users it is the
     single largest variable cost. Design OTP retry limits accordingly (you already have them).

INFRASTRUCTURE
  App server + worker (2 small instances)                 ≈  ৳3,000–6,000
  Managed Postgres + backups                              ≈  ৳2,000–5,000
  Redis                                                   ≈  ৳1,000–2,000
  Object storage + bandwidth                              ≈  ৳500–1,500
  Domain, TLS, monitoring                                 ≈  ৳500–1,000
                                                   subtotal ≈ ৳7,000–15,500

ONE-OFF / ANNUAL
  Company registration + trade licence + TIN/VAT          ≈  ৳20,000–30,000 (one-off)
  Accounting/audit                                        ≈  ৳20,000+/year
  Google Play developer account                           ≈  US$25 one-off
  Payment gateway setup                                   ≈  ৳4,000–25,000 (when you get there)
  Legal (entity + ToS/privacy + payment opinion)          ≈  budget seriously; get 3 quotes
  D-U-N-S number (if org Play account)                    ≈  free but reportedly up to ~28–30 days

PEOPLE (the real cost)
  1 ops/concierge person, part-time, months 1–4           ≈  the largest line item
  20 campus ambassadors paid per ACTIVATED worker         ≈  variable; budget per activation,
                                                             never per install
```

**The insight the table hides:** at pilot scale your infrastructure is nearly free and your
**people** are nearly everything. Budget accordingly. A ৳10,000/month server bill is irrelevant;
an unpaid ops person who quits in week 5 kills the pilot.

## 4.3 Environments and data residency

```text
[ ] Decide: production data in Bangladesh, or regional cloud with an in-country synchronised copy
    for restricted-tier data? Take the PDPA classification (1.3) to counsel and decide once.
[ ] Staging uses synthetic data only — never a copy of production. This is now a legal
    requirement, not hygiene.
[ ] Backups: nightly + PITR + a documented, *tested* restore drill. An untested backup is a story
    you tell yourself.
[ ] Secrets in a manager, not .env on a server. Rotate on any team change.
```

---
---

# PART 5 — TEAM, CAPACITY & THE SINGLE-FOUNDER PROBLEM

## 5.1 The roles this product needs (they are not all engineering)

| Role | Load at pilot | Can Codex do it? | Who does it? |
|---|---|---|---|
| Backend + mobile engineering | High | **Mostly yes**, under your direction | You + Codex |
| Product decisions, spec review, acceptance | High | No — this is judgement | **You only** |
| UI design / illustration / Bangla copy | Medium (front-loaded) | Partly | You or a designer friend |
| **Ops / concierge (watching jobs, calling workers)** | **High, daily, 8+ weeks** | ❌ No | **UNASSIGNED — G9** |
| Worker recruitment & verification (in person) | High, front-loaded | ❌ No | Ambassadors |
| Support (phone, 09:00–22:00) | Medium | ❌ No | **UNASSIGNED** |
| Dispute adjudication | Low-medium but urgent | ❌ No | You (document decisions) |
| Legal / accounting | Bursty | ❌ No | Retained professionals |

**The honest read:** you cannot run Phase 3 (pilot) alone while also finishing Phases 5–8. The
build guide's concierge model — a human watching every job and phoning matched workers within 60
minutes — is a **job**, not a background task. Either recruit a co-founder/ops partner, or cut the
pilot's opening hours and geography until one person can genuinely cover it.

## 5.2 Concrete staffing plan to write

```text
[ ] Name the ops person. If it is you, block the hours in a calendar and shrink the pilot to fit.
[ ] Define ambassador comp: paid per ACTIVATED worker (profile complete + availability set +
    first application), never per install. Cap the budget. Write the anti-fraud rule (no
    self-referrals, verified by first completed job).
[ ] Write a 1-page ops runbook: what to check hourly, what triggers a phone call, what to say,
    where to log it. Train two people on it before launch day.
[ ] Set support hours honestly in the app. "09:00–22:00, we reply within 4 hours" beats a
    24/7 promise you cannot keep.
[ ] Bus factor: a second person must have production access and know the restore procedure.
```

---
---

# PART 6 — RELEASE & DISTRIBUTION PLAN 🟠

## 6.1 The Play Store gates (plan 8 weeks ahead, not 8 days)

**Gate 1 — Closed testing.** Personal developer accounts created on or after **13 November 2023**
must run a closed test with **at least 12 testers opted in continuously for 14 days** before
applying for production access. Google reduced this from 20 to 12 in December 2024. Emulators and
duplicate accounts do not count; opted-in-but-idle testers are the common failure mode.
**Organization accounts are exempt** — but require a **D-U-N-S number** (reported to take up to
~28–30 days) and a registered business.

**Gate 2 — Developer verification.** A separate identity requirement (legal name, address, email,
phone; organizations also D-U-N-S and website verification), opened to all developers March 2026,
with enforcement reported starting **30 September 2026 in Brazil, Indonesia, Singapore and
Thailand, expanding globally from 2027**. Meeting one gate does not satisfy the other.

**What this means for KAJ specifically — and it is convenient:**
```text
Your 12 testers are your first 12 workers. Recruit 15–18 (buffer for drop-off) from RUET clubs
and run the closed test AS the supply-side alpha. The 14-day window is the same 14 days you use
to shake out onboarding bugs. Watch Console engagement from day 1 and replace inactive testers
immediately — a tester who opts in and never opens the app is a failed test.

If you incorporate anyway (Part 1), consider the organization account: it removes the 12-tester
gate for this app AND every future app, and you will need the entity regardless.
```

## 6.2 Store listing checklist

```text
[ ] Play Console account (US$25) — decide personal vs organization NOW, migration later is painful
[ ] App name, short + full description in BANGLA and English
[ ] Feature graphic, icon, 8 screenshots (phone), in Bangla, showing real screens
[ ] Privacy policy URL (must exist and match PDPA consent copy — 1.3)
[ ] Data safety form — must accurately declare location, phone, photos, identity documents.
    Mis-declaring this is an app-removal offence.
[ ] Permissions: declare and justify location, camera, notifications, storage
[ ] Content rating questionnaire · target audience & age (see G10 — if under-18 users are
    permitted, the whole "families" policy surface opens)
[ ] Account deletion URL (required by Play policy) — your DELETE /me endpoint plus a web page
[ ] Signing key stored in a password manager AND a second location. Losing it ends the app.
[ ] Staged rollout 10% → 50% → 100%; force-update mechanism; maintenance mode
[ ] iOS: out of scope for the pilot — say so explicitly and stop debating it
```

---
---

# PART 7 — TRUST, SAFETY & INCIDENT OPERATIONS

## 7.1 The minors question — decide before launch 🟠

Your primary supply segment is students. Some will be under 18. The PDPA regime requires
parental/guardian consent for children's data and **prohibits profiling, behavioural tracking and
targeted advertising directed at minors**, with restrictions on automated decision-making using
children's data. Your matching engine is automated decision-making.

**Three options — pick one and implement it, do not drift:**
```text
OPTION 1 (recommended for pilot): 18+ only.
  Age gate at signup, stated in ToS, enforced at verification. Simple, defensible, and removes an
  entire category of legal and safety risk during the period you can least afford it.
  Cost: you lose 1st/2nd-year undergraduates. Accept it for 6 months.

OPTION 2: 16–17 permitted on a restricted category list, with guardian consent recorded.
  Requires: age capture, guardian consent flow, category blocking, no profiling for that cohort,
  and a separate safety protocol. Significant extra build + legal work.

OPTION 3: 18+ workers, any age for *posters* under a guardian account.
  Middle path; still needs an age gate.
```
Whatever you choose, **hard-block under-16 entirely** and make the rule visible in the ToS,
the signup flow, and the Play Store content rating.

## 7.2 Incident position (write this before you need it)

```text
[ ] Written incident protocol: log → contact both parties within 2h → suspend if needed →
    escalate to police/authorities where warranted → record in moderation_actions →
    post-incident review within 48h → publish learnings internally
[ ] Named incident owner + a backup, with phone numbers, available during operating hours
[ ] A pre-drafted (not pre-published) holding statement for a serious incident
[ ] Insurance: research whether any BD insurer offers accident cover for platform workers.
    Fairwork-style critiques focus exactly here. If cover is unavailable or unaffordable,
    SAY SO HONESTLY in the safety page rather than implying protection you do not provide.
[ ] Emergency contact field for student workers (optional, consented, admin-visible only)
[ ] A "meet in a public place first" norm designed into the product, not buried in a policy
```

## 7.3 Anti-fraud operational readiness

```text
[ ] Manual review queue staffed daily from day 1 (the ML comes much later)
[ ] Referral fraud rule written BEFORE the referral programme launches
[ ] A written policy for what earns a warning vs. restriction vs. suspension vs. ban, published
[ ] Appeal path with a human, stated response time — this is both fairness and legal hedging (1.4)
```

---
---

# PART 8 — CONTENT, DATA & ASSET PLAN 🟡

This is the most commonly underestimated pre-build workstream. It is 3–5 weeks of work and it
blocks Phase 2.

```text
CATEGORY TAXONOMY
[ ] Final list of ~8 parent categories and ~50 subcategories, each with: slug, Bangla name,
    English name, icon/illustration, safety policy flags, typical price range (left EMPTY until
    real data exists), required-certificate flag, min age
[ ] Validate the names with 10 real users — "ডেটা এন্ট্রি" may be clearer than a literal
    translation; ask, don't assume

SKILL TAXONOMY
[ ] ~150 skills mapped to categories, with Bangla names and common synonyms for search
    (including Banglish spellings: "graphic design", "গ্রাফিক ডিজাইন", "grafix")

LOCATION DATA
[ ] Rajshahi City Corporation wards + the working area list (RUET, Talaimari, Kazla, Binodpur,
    Motihar, Shaheb Bazar, Laxmipur, Court, Boalia, Uposhohor, Padma R/A, Hetem Khan, Katakhali,
    Novotheatre, Rajpara, Shahmakhdum…) with lat/lng and a sensible radius each
[ ] VERIFY these on the ground — a wrong area centroid ruins distance ranking, and distance is
    15% of your match score
[ ] Decide the display name convention (locals may use a landmark, not the official ward name)

COPY & TRANSLATION
[ ] Every string in bn + en. Written in everyday spoken Bangla, reviewed by 3 target users.
[ ] Legal copy: ToS, privacy policy, community guidelines, safety page, cancellation policy,
    fee disclosure — in Bangla, lawyer-reviewed, plain enough for a class-8 reader
[ ] Notification templates (D11 in the build guide) — ~25 messages, each ≤ 100 Bangla characters
[ ] Empty-state and error copy (~60 strings) — specced in the UI requirements doc

VISUAL ASSETS
[ ] App icon + splash + Play Store graphics
[ ] ~50 category illustrations in one consistent style (this is a real design job — budget it)
[ ] Empty-state illustrations (~8)
[ ] Onboarding imagery showing recognisably Rajshahi contexts, with consent if photographic

SEED DATA (be careful here)
[ ] Categories, skills, locations, badges, config defaults, feature flags — YES, seed these
[ ] Fake jobs, fake workers, fake reviews, fake counts — ABSOLUTELY NOT, in any environment that
    a real user can see. This is the fastest way to destroy a local marketplace's reputation.
```

---
---

# PART 9 — FUNDING, UNIT ECONOMICS & RUNWAY

## 9.1 What you must be able to answer before spending anything

```text
Q1. What does it cost to acquire one ACTIVATED worker? (ambassador payment + verification time)
Q2. What does it cost to acquire one ACTIVATED poster?
Q3. What is the average job value in Rajshahi, by category? (from your Phase 0 research)
Q4. At what take rate does one completed job cover its own payment + SMS cost?
Q5. How many completed jobs per month does it take to cover fixed costs?
Q6. How many months of runway do you have at that burn?
```
Build this as a **spreadsheet with variables, not a slide with constants.** Three scenarios.
If you cannot fill Q3 from real research, you are not ready to set a fee.

## 9.2 Funding paths worth scoping (Bangladesh-specific)

```text
[ ] Bootstrapped pilot — realistic: the pilot's true cost is mostly your time + ambassador payments
[ ] University/incubator support: RUET, ICT Division / a2i / Startup Bangladesh programmes,
    iDEA project, university innovation funds — check current windows and eligibility
[ ] Grants: youth entrepreneurship, employment/skills-focused donors (your existing grant-writing
    experience is directly reusable here)
[ ] Angel/seed: only after the Week-12 gate data exists. Marketplace investors buy fill rate and
    repeat rate, not screenshots.
[ ] Revenue-first alternative: charge businesses for recurring staffing (Phase 11) before charging
    individuals anything — B2B willingness-to-pay is usually higher and easier to validate
```
⚠️ Verify every programme's current status before applying — funding windows and programme names
in Bangladesh have shifted since 2024.

---
---

# PART 10 — MEASUREMENT, KILL CRITERIA & DECISION CALENDAR

## 10.1 Kill criteria (write them now, while you are unattached)

```text
STOP or PIVOT if, at Week 12 of the pilot:
  - fill rate < 35%                        → demand exists but supply does not match: fix matching
                                              or recruit differently before building anything
  - completion rate < 70%                  → trust is broken: stop feature work entirely
  - repeat-hire rate < 10%                 → no relationship layer forming: the core loop is weak
  - median time-to-first-application > 6h  → liquidity too thin: shrink the geography further
  - < 100 completed jobs total             → the market is not responding: revisit the segment
  - you personally cannot sustain ops      → shrink scope until you can, or stop

CONTINUE AND EXPAND only if fill rate, completion rate, AND repeat-hire rate are all above target.
```
Print these. Date them. Sign them. The purpose of writing kill criteria before launch is that
you will not be able to write them honestly afterwards.

## 10.2 Decision calendar

| When | Decision | Inputs |
|---|---|---|
| Week 0 | Entity type; Play account type | Part 1, Part 6 |
| Week 0 | Under-18 policy | Part 7.1 |
| Week 2 | Hosting & data residency | Part 1.3, Part 4.3 |
| Week 4 | SMS aggregator (after trial) | Part 4.1 |
| Week 6 | Category/location taxonomy frozen | Part 8 |
| Week 8 | Ops staffing confirmed | Part 5 |
| Pre-launch | Payment model A/B/C + legal opinion | Part 2 |
| Week 12 pilot | Continue / pivot / stop | Part 10.1 |

---
---

# PART 11 — RISK REGISTER ADDITIONS

| Risk | Likelihood | Impact | Early warning | Mitigation |
|---|---|---|---|---|
| Entity/licence paperwork delays launch by 6+ weeks | High | Medium | No trade licence by week 4 | Start week 1; run the pilot cash-only meanwhile |
| Payment model requires a licence you cannot get | Medium | High | Counsel hesitates on Model B | Cash-first design already in place; keep the ledger abstraction |
| Cannot disburse to workers at scale | High | High | Gateway can't answer the payout question | Manual MFS payouts for the first 100 jobs; renegotiate later |
| "Verified" badge is challenged as misleading | Medium | High | A user asks how verification works | Label exactly what was checked (Part 3.2 V1) |
| PDPA non-compliance surfaces at investor DD | Medium | Medium | No data inventory exists | Do the inventory during Phase 1 |
| Play closed-testing gate discovered late | High | Medium | Fewer than 12 active testers at T-14d | Recruit 18 testers from your first worker cohort |
| Ops burnout (single founder) | **High** | **High** | Missed concierge calls in week 2 | Shrink geography and hours; recruit an ops partner now |
| Safety incident involving a student | Low | **Severe** | Any near-miss report | 18+ policy, verified posters, public-place norm, incident protocol |
| Disintermediation (deals go off-platform) | High | Medium | Completed-job count flat while chat volume rises | Make on-platform genuinely better (reputation, repeat-hire, dispute help) — not by surveillance |
| Labour-law expansion adds obligations | Medium | Medium | New ordinance or ILO outcome | Avoid employer-like control; keep human review; track amendments |
| SMS costs scale with signups, not revenue | High | Medium | OTP spend rising faster than jobs | Retry limits, resend cooldown, cache sessions long, consider WhatsApp OTP later |
| Ambassador referral fraud | Medium | Medium | Activation spike with no jobs | Pay on first *completed job*, not signup |

---
---

# PART 12 — T-MINUS MASTER CHECKLIST

```text
T-12 WEEKS (start now, runs in parallel with Phases 1–2)
[ ] Decide entity type; begin RJSC name clearance + incorporation
[ ] Apply for Rajshahi City Corporation trade licence
[ ] e-TIN; open company bank account
[ ] Decide Play account type (personal vs organization + D-U-N-S)
[ ] Engage a lawyer (entity, ToS/privacy, payment opinion, labour position)
[ ] Engage a CA (VAT treatment of commission, withholding questions)
[ ] Begin Phase 0 research deliverables (build guide PART C) — this is the input to everything

T-8 WEEKS
[ ] SMS aggregator trials on all four operators; measure OTP delivery latency and success
[ ] Category/skill/location taxonomy drafted and user-tested
[ ] Bangla copy deck drafted; legal copy sent for review
[ ] Data inventory + consent architecture designed (PDPA)
[ ] Ops person named; ops runbook drafted
[ ] Ambassador programme designed (comp model, anti-fraud rules, cap)
[ ] Under-18 policy decided and specced

T-6 WEEKS
[ ] Hosting + data residency decided; production environment provisioned
[ ] Backup + restore drill completed successfully (not just configured)
[ ] Illustration/asset production underway
[ ] Play Console account created and verified; signing key secured in two places
[ ] Recruit 18 closed-test candidates from the first worker cohort

T-4 WEEKS
[ ] Closed test live (12+ testers, 14 continuous days — clock starts here)
[ ] Privacy policy + ToS published at a live URL; data safety form completed accurately
[ ] Support phone line live; hours published
[ ] First 50 workers verified in person by ambassadors
[ ] Concierge dashboard usable by a non-engineer (admin Phase 8 gate)

T-2 WEEKS
[ ] Usability testing round complete (UI requirements PART 7); critical errors fixed
[ ] Security pass + dependency audit complete
[ ] Incident protocol written; owners named; holding statement drafted
[ ] Kill criteria signed and dated
[ ] First 30 demand-side accounts onboarded face to face

LAUNCH WEEK
[ ] Production access granted; staged rollout at 10%
[ ] Ops watching every job in real time
[ ] Daily standup on: jobs posted, applications, fills, completions, complaints
[ ] Nothing new shipped for 14 days — watch, call users, fix
```

---
---

# PART 13 — OPEN QUESTIONS REQUIRING PROFESSIONAL ADVICE `[LEGAL]`

Take this exact list to counsel. Do not answer these from a blog post — including this one.

```text
Q1.  Does a labour/services marketplace fall within the Digital Commerce Operation Guidelines and
     the DBID requirement, or outside them (services vs. goods)?
Q2.  Under Model B (collect via a licensed PSO, hold 24–72h, then disburse), does KAJ require any
     Bangladesh Bank authorisation, and does the holding period change the answer?
Q3.  What is the correct VAT treatment of a platform commission on a labour service, and at what
     turnover does registration become mandatory?
Q4.  Are there withholding tax obligations on micro-payments to individual workers?
Q5.  Given the 2026 labour amendment, what contractual language and operational practices keep
     KAJ clearly an intermediary rather than an employer?
Q6.  What is the minimum lawful age for the categories of work KAJ intends to intermediate, and
     what guardian-consent mechanism satisfies the PDPA for 16–17 year olds?
Q7.  Which of KAJ's data fields are "restricted" under the PDPA classification, and does that
     force in-country storage or an in-country synchronised copy?
Q8.  What are the breach notification duties and timelines, and to whom?
Q9.  What is KAJ's liability exposure if a worker causes injury or loss at a job site, and can it
     be limited by ToS? Is any insurance product available?
Q10. What must the ToS say about dispute resolution, and is a platform-run dispute process
     enforceable, or does it need an arbitration clause?
Q11. Is a lawful path to NID verification available to a non-BB-regulated entity, directly or via
     an authorised intermediary?
Q12. Any restriction on collecting and storing photographs of NIDs?
```

---
---

# PART 14 — SOURCES

```text
PAYMENTS & LICENSING
  Bangladesh Bank — Payment Systems (PSP/PSO definitions, BPSSR-2014, MFS Regulations 2022)
    https://www.bb.org.bd/en/index.php/financialactivity/paysystems
  LegalSeba — Ultimate Guide to Fintech Licensing in Bangladesh (PSO count, PSS Act 2024)
    https://legalseba.com/bd-licenses/ultimate-guide-to-fintech-licensing-in-bangladesh-mfs-digital-bank-psp-pso/
  Tahmidur Rahman TRW — Fintech Payments & PSP Licensing (timeline, dossier checklist)
    https://tahmidurrahman.com/fintech-payments-psp-licensing/
  Lawzana — PSP/PSO licensing steps and timelines
  Geekssort — Payment Gateway Integration for Bangladeshi Businesses 2026
    https://geekssort.com/payment-gateway-integration-bangladesh-2026/
  AvienTech / BDIGITIC / Moneybag — gateway fee and settlement comparisons (2026)
  nashirahmed.com — E-Commerce Business Registration & Legal Compliance in Bangladesh (2026)
    https://nashirahmed.com/ecommerce-business-registration-legal-compliance-bangladesh/

DATA PROTECTION
  Securiti — Overview of Bangladesh's Personal Data Protection Act, 2026 (timeline PDPO→PDPA)
    https://securiti.ai/bangladesh-personal-data-protection-act-overview/
  Jural Acuity — Personal Data Protection Ordinance 2025 (classification, localisation, penalties)
    https://juralacuity.com/personal-data-protection-ordinance/
  Recording Law — Bangladesh Data Privacy Laws: PDPO 2025 and framework (enforcement dates)
    https://www.recordinglaw.com/world-laws/world-data-privacy-laws/bangladesh-data-privacy-laws/
  The Daily Star — PDPO 2025 key takeaways (children's data, profiling prohibition)
    https://www.thedailystar.net/tech-startup/news/bangladeshs-personal-data-protection-ordinance-2025-key-takeaways-4015401
  SCL Insights — What every Bangladeshi business must do (consent standard, compliance steps)
    https://bd-scl.com/insights/personal-data-protection-ordinance-2025-compliance.html
  Mahbub & Company — Key highlights for businesses (four-tier classification)

LABOUR
  Mondaq — The Rules Have Changed: Bangladesh's 2025-2026 Labour Law Reforms
    https://www.mondaq.com/employee-benefits-compensation/1800374/
  Global Law Experts — Bangladesh Labour Amendment Act 2026: An Employers Guide
  The Business Standard — Surviving the platform economy (Fairwork Bangladesh findings)
  The Daily Star — Legal reforms for workers of the gig economy

E-COMMERCE REGISTRATION
  The Daily Star — NID sufficient for securing digital business ID (DBID guideline 2022)
  LegalSeba — Digital Business ID (DBID) Registration (adoption statistics)
  Mahbub & Company — Digital Commerce Operational Guidelines summary
  Dhaka Tribune / Financial Express — Draft Cross-Border Digital Trade Policy 2026

COMPANY FORMATION
  Jural Acuity — Company Registration in Bangladesh 2026 Guide (process, timeline)
    https://juralacuity.com/company-registration-in-bangladesh/
  Legal Advice BD — Sole Proprietorship Registration 2026 (trade licence cost, OPC capital)
  bangladesh-consultant.com — Limited company registration fee guide
  usemultiplier.com — Company registration cost breakdown

IDENTITY
  Porichoy (Bangladesh Election Commission / BNDA)   https://porichoy.gov.bd/
  Didit — Identity verification in Bangladesh (Porichoy access restrictions)
    https://didit.me/solutions/countries/bangladesh/

SMS
  BTRC-licensed aggregators: bulksmsbd.com · mimsms.com · smsbangladesh.com · sms.bd · zaman-it.com
  MiMSMS — Bulk SMS Price in Bangladesh 2026   https://www.mimsms.com/bulk-sms-price-in-bangladesh-2026

PLAY STORE
  Google Play Console Help — App testing requirements for new personal developer accounts
    https://support.google.com/googleplay/android-developer/answer/14151465
  TesterBee / PrimeTestLab / ontest.app / testfi.app — 12-tester rule and developer verification
    analyses (2026)
```

> **Verification note:** every figure, fee, timeline and legal position above was gathered from
> public sources in August 2026 and is reported, not verified independently. Bangladeshi
> regulation in payments, data protection and labour changed substantially in 2025–2026 and is
> still moving. **Re-check each item before you rely on it, and get professional advice for
> anything marked `[LEGAL]`.**

---

## THE ONE-PARAGRAPH SUMMARY

The software plan is finished; the company plan is not. Three things are hard blockers and should
start this week regardless of code progress: **incorporate and get the trade licence** (everything
else depends on it), **decide the payment model with counsel** (you almost certainly cannot hold
funds, so design cash-first and keep the ledger abstraction), and **name the person who will do
concierge operations** (the pilot is a staffing problem wearing a software costume). Two more are
quietly urgent: **the PDPA consent architecture** must be designed into the schema now rather than
retrofitted, and the **Play Store 12-testers-for-14-days gate** must be scheduled backwards from
your launch date. Everything else in this document is important, but those five decide whether
there is a pilot at all.

*END OF PRE-BUILD PLANNING GAPS*

# AI Opportunity Intelligence (P4)

Server-side AI for KAAJ, built on Anthropic's `claude-sonnet-5-5` through
`@anthropic-ai/sdk`. The mobile app never talks to the model: it calls
the routes below, and the API decides what (redacted) data is sent.

| Feature                 | Who                      | Cost to the user | Daily quota (default) |
| ----------------------- | ------------------------ | ---------------- | --------------------- |
| Idea analysis           | The idea's owner         | Subscribers only | 3                     |
| Opportunity suggestions | Any signed-in user       | Free             | 10                    |
| Business growth tips    | Accepted business member | Free             | 5                     |

Everything is **off by default** (`AI_ENABLED=false`). With it off, or
with no `ANTHROPIC_API_KEY`, the API boots normally and every generation
route answers `503 AI_DISABLED`; `GET /ai/status` says `enabled: false`.

## Order of checks (generation routes)

1. Route policy (owner / member): anyone else gets `404 NOT_FOUND`.
2. AI enabled: `503 AI_DISABLED`.
3. Consent given (current version): `403 AI_CONSENT_REQUIRED`.
4. Feature rules — idea analysis only: the idea's `aiConsent` is on
   (`409 AI_IDEA_CONSENT_REQUIRED`), then an active subscription
   (`403 SUBSCRIPTION_REQUIRED`).
5. Daily quota: `429 AI_QUOTA_EXCEEDED` with `Retry-After` (seconds to
   midnight Asia/Dhaka).
6. The model call. Provider failure or timeout: `503 AI_UNAVAILABLE`
   (retryable; the quota slot is given back).

"Subscribers only" holds **even while `subscriptions_enabled` is off**
(owner decision), unlike Work features, which are free until the paywall
launches. The access rule `AI_IDEA_ANALYSIS` (seeded by the migration)
is the switch: deactivate it in the admin console to make idea analysis
free. With `module_entitlements_enabled` on, a plan unlocks it only if its
`feature_keys` include `AI_IDEA_ANALYSIS` (or are empty).

## Routes

All under `/api/v1`, bearer token required, standard envelope
(`{ data, meta }` / `{ error }`).

### `GET /ai/status`

Show or hide AI in the app. No model call; works with AI off.

```json
{
  "enabled": true,
  "consent": {
    "required": true,
    "currentVersion": 1,
    "accepted": false,
    "acceptedVersion": null,
    "acceptedAt": null
  },
  "quotaResetsAt": "2026-11-20T18:00:00.000Z",
  "features": {
    "IDEA_ANALYSIS": {
      "dailyLimit": 3,
      "usedToday": 0,
      "remainingToday": 3,
      "requiresSubscription": true,
      "subscriptionActive": false
    },
    "OPPORTUNITY_SUGGESTIONS": {
      "dailyLimit": 10,
      "usedToday": 2,
      "remainingToday": 8,
      "requiresSubscription": false,
      "subscriptionActive": null
    },
    "BUSINESS_GROWTH_TIPS": { "...": "same shape" }
  }
}
```

`usedToday` / `remainingToday` are `null` if the quota store can't be read.

### `POST /ai/consent` — body `{ "version": 1 }`

One-time opt-in to the consent text below; send the `currentVersion` the
app showed. Stored with the version and time (`ai_consents`), audited
(`ai.consent.accepted`). Returns the `consent` object above.
Wrong version: `400 AI_CONSENT_VERSION_MISMATCH` (`details[0].currentVersion`).
When the text changes the version goes up and users must accept again.

### `DELETE /ai/consent`

Withdraw. No AI call happens for the user afterwards; results already
stored (idea analyses) stay, as they are the user's own. Returns `consent`.

### `POST /ideas/:id/ai-analysis` — body `{ "locale"?: "bn" | "en" }`

Owner only, subscribers only, needs the idea's `aiConsent: true`
(`PATCH /ideas/:id`). Stores the result on the idea and returns it:

```json
{
  "ideaId": "…",
  "locale": "bn",
  "model": "claude-sonnet-5-5",
  "analyzedAt": "2026-11-20T09:12:00.000Z",
  "analysis": {
    "summary": "…",
    "feasibility": { "rating": "LOW | MEDIUM | HIGH", "explanation": "…" },
    "localMarketFit": {
      "rating": "LOW | MEDIUM | HIGH",
      "explanation": "…",
      "targetCustomers": ["…"]
    },
    "startupCostsBdt": {
      "items": [{ "item": "…", "minBdt": 350000, "maxBdt": 450000 }],
      "totalMinBdt": 430000,
      "totalMaxBdt": 570000,
      "assumptions": "…"
    },
    "risks": [{ "risk": "…", "severity": "HIGH", "mitigation": "…" }],
    "nextSteps": [{ "step": "…", "timeframe": "2 weeks" }],
    "kaajConnections": {
      "experts": [{ "field": "…", "why": "…" }],
      "learning": [{ "topic": "…", "why": "…" }],
      "partners": [{ "partnerType": "…", "why": "…" }]
    }
  }
}
```

Limits (validated server-side): text fields ≤ 80–800 chars, 1–5 target
customers, 1–10 cost lines, 1–6 risks, 1–7 next steps, ≤ 4 per KAAJ
connection list, every `min ≤ max`. Amounts are whole taka.
`kaajConnections` describes kinds of experts / trainings / partners to
search for in KAAJ, never named people.

If the model declines or its answer fails validation: `422 AI_DECLINED`,
nothing is stored and the previous analysis stays. This still uses a
quota slot (tokens were spent).

### `GET /ideas/:id/ai-analysis`

Owner only. The stored analysis in the same shape (all fields `null` if
there is none). No model call; works with AI off.

### `POST /ai/opportunity-suggestions` — body `{ "locale"?: "bn" | "en", "types"?: ["JOB", "LEARNING", "MENTOR", "GROUP"] }`

The server retrieves up to 12 open jobs, 8 learning opportunities,
8 accepting mentors and 8 public groups (nearest area and matching skills
first; nobody in a block; never one's own; women-only groups only for
profiles marked female; groups the user is in or asked to join are left
out). The model only ranks and explains them; anything it returns that
the server didn't send is dropped.

```json
{
  "source": "AI | FALLBACK | NONE",
  "locale": "en",
  "summary": "Start with the nearby tailoring job.",
  "generatedAt": "…",
  "items": [
    {
      "type": "JOB | LEARNING | MENTOR | GROUP",
      "id": "…",
      "title": "Blouse tailoring, 3 days",
      "area": { "nameEn": "Boalia", "nameBn": "বোয়ালিয়া" },
      "score": 87,
      "reason": "You already sew blouses; this is in your area."
    }
  ]
}
```

At most 15 items. Open an item with the existing detail routes:
`GET /jobs/:id`, `GET /learning-opportunities/:id`,
`GET /users/:id/public` (mentor) or `GET /community/groups/:id`. `title`
for a mentor is the masked display name the mentor directory shows.

- `FALLBACK`: the model declined or answered badly; items are in the
  server's own order with `score` and `reason` `null` (quota used).
- `NONE`: nothing to suggest; no model call and no quota used.

### `POST /businesses/:id/ai-growth-tips` — body `{ "locale"?: "bn" | "en" }`

Accepted members of the business only. Not stored.

```json
{
  "businessId": "…",
  "source": "AI | FALLBACK",
  "locale": "bn",
  "generatedAt": "…",
  "summary": "…",
  "tips": [
    {
      "title": "…",
      "detail": "…",
      "area": "MARKETING | SALES | OPERATIONS | FINANCE | DIGITAL | PARTNERSHIPS | SKILLS | CUSTOMER_SERVICE",
      "effort": "LOW | MEDIUM | HIGH",
      "costBdt": { "min": 0, "max": 500 },
      "kaajAction": "POST_JOB | FIND_EXPERT | LEARN_SKILL | JOIN_GROUP | LIST_OFFERING | FIND_PARTNER | NONE"
    }
  ]
}
```

3–7 tips. `FALLBACK` returns KAAJ's standard tips in the same shape.

## Language

Output follows the body's `locale`, else the profile's `locale`, else
the account's `default_locale`, else Bangla. Enum values stay English.

## Privacy

- Nothing is sent before the user's consent; idea analysis also needs the
  idea's own `aiConsent`.
- Before anything is sent, phone numbers (BD mobile, +88 / 0088, ASCII or
  Bangla digits), email addresses, NID / birth-registration / other
  10+-digit numbers, exact addresses (house / holding / flat / plot /
  road / lane / block / sector numbers, postcodes, `City-1234`) and map
  coordinates are replaced by `[PHONE]`, `[EMAIL]`, `[NID]`,
  `[ID_NUMBER]`, `[ADDRESS]`, `[LOCATION]` (`backend/src/modules/ai/redaction.ts`).
  Area names are kept. Person names inside free text are not detected.
- Other users' personal data is never sent: no names, photos, bios,
  phone numbers or ids of posters, mentors, group members, idea team
  members or business members. Candidates go to the model as short refs
  (J1, M2…) with titles, skills, categories, area names and pay terms.
- For a business: category, stage, size, area, redacted description and
  offerings only — not its name, address, trade licence or contact person.
- The usage log stores tokens, cost, model and outcome, never prompt or
  answer text.

### Consent text, version 1 (the app shows this)

**English** — KAAJ AI uses Anthropic's Claude model to analyse your ideas,
suggest opportunities and give business tips. When you use an AI feature,
KAAJ sends the information that feature needs — your idea or business
description, your skills and area, and opportunities listed on KAAJ — to
Anthropic to produce the answer. Phone numbers, email addresses, NID
numbers and exact addresses are removed first, and other people's
personal details are never sent. AI answers can be wrong: check important
decisions with an expert. You can turn this off at any time.

**বাংলা** — KAAJ AI আপনার আইডিয়া বিশ্লেষণ, সুযোগের পরামর্শ ও ব্যবসার টিপস
দিতে Anthropic-এর Claude মডেল ব্যবহার করে। আপনি কোনো AI সুবিধা ব্যবহার
করলে, উত্তর তৈরির জন্য সেই সুবিধার দরকারি তথ্য — আপনার আইডিয়া বা ব্যবসার
বিবরণ, আপনার দক্ষতা ও এলাকা, এবং KAAJ-এ থাকা সুযোগগুলো — Anthropic-এ
পাঠানো হয়। পাঠানোর আগে ফোন নম্বর, ইমেইল, এনআইডি নম্বর ও সঠিক ঠিকানা মুছে
ফেলা হয়, আর অন্য কারও ব্যক্তিগত তথ্য কখনো পাঠানো হয় না। AI-এর উত্তর ভুল
হতে পারে: গুরুত্বপূর্ণ সিদ্ধান্তের আগে বিশেষজ্ঞের সাথে মিলিয়ে নিন। আপনি
যেকোনো সময় এটি বন্ধ করতে পারেন।

## Model call details

- Model `claude-sonnet-5-5` (`AI_MODEL`), adaptive thinking (default),
  effort set per feature: idea analysis `medium`, suggestions and tips
  `low`; `max_tokens` 16 000 / 8 000.
- Structured output: each feature's zod schema is sent as
  `output_config.format` (JSON schema) and the answer is re-validated on
  the server (lengths, counts, ranges, `min ≤ max`). The model gets no
  tools: retrieval is done by the server.
- Prompt caching: the system prompts are static (no dates or user data)
  and marked `cache_control: ephemeral`; repeated calls of a feature
  within 5 minutes read them from cache.
- Refusals: server-side fallback (`fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`) retries eligible declines on the
  default fallback model. `stop_reason` is checked before any content is
  read; a refusal, a truncated answer (`max_tokens`) or an invalid answer
  is never shown — the feature's safe fallback is used instead.
- Timeouts and retries: `AI_TIMEOUT_MS` per attempt, `AI_MAX_RETRIES`
  retries of connection errors, 408/409/429 and 5xx (SDK behaviour).

## Environment

| Variable                       | Default             | Notes                                                              |
| ------------------------------ | ------------------- | ------------------------------------------------------------------ |
| `AI_ENABLED`                   | `false`             | `true` to turn AI on.                                              |
| `ANTHROPIC_API_KEY`            | (empty)             | Secret. Host env only (Render secret), never in the repo.          |
| `AI_MODEL`                     | `claude-sonnet-5-5` | Leave as is unless the owner decides otherwise.                    |
| `AI_TIMEOUT_MS`                | `60000`             | Per attempt, 5 000–300 000.                                        |
| `AI_MAX_RETRIES`               | `2`                 | 0–5.                                                               |
| `AI_DAILY_LIMIT_IDEA_ANALYSIS` | `3`                 | Per user per Asia/Dhaka day (0 disables the feature for everyone). |
| `AI_DAILY_LIMIT_SUGGESTIONS`   | `10`                | Same.                                                              |
| `AI_DAILY_LIMIT_GROWTH_TIPS`   | `5`                 | Same.                                                              |
| `AI_GLOBAL_DAILY_LIMIT`        | `2000`              | Model calls per day across all users (cost backstop; then 503).    |

Quotas are counted in Redis (`REDIS_URL`); if Redis is unreachable AI
calls are refused (`503 AI_UNAVAILABLE`) rather than unmetered.

## Database (migration `20261120090000_ai_opportunity_intelligence`, additive)

- `ai_consents` — one row per user: `version`, `consented_at`, `withdrawn_at`.
- `ai_usage_logs` — one row per model call: `feature`, `outcome`
  (`SUCCESS | REFUSED | INVALID_OUTPUT | ERROR`), `model`, `subject_id`,
  token counts (input, output, cache read, cache write), `cost_usd_micros`
  (estimate at list prices), `latency_ms`.
- `business_ideas` — nullable `ai_analysis` (JSON), `ai_analysis_locale`,
  `ai_analysis_model`, `ai_analyzed_at`.
- `subscription_access_rules` — row `AI_IDEA_ANALYSIS`.

`down.sql` reverses all of it. Daily cost:
`SELECT feature, count(*), sum(cost_usd_micros)/1e6 AS usd FROM ai_usage_logs WHERE created_at > now() - interval '1 day' GROUP BY 1;`

## Estimated cost per call

List prices for `claude-sonnet-5-5`: $2 / MTok input, $10 / MTok output
(thinking tokens count as output), $2.50 / MTok cache writes, $0.10 / MTok
cache reads. Estimates (Bangla output uses more tokens than English):

| Feature                 | Input tokens                     | Output tokens (incl. thinking) | ≈ USD per call |
| ----------------------- | -------------------------------- | ------------------------------ | -------------- |
| Idea analysis           | ~1.2k cached system + ~1k        | ~2.5k–5k (effort `medium`)     | $0.03 – $0.055 |
| Opportunity suggestions | ~1.1k cached system + ~2.5k–3.5k | ~1k–2k (effort `low`)          | $0.015 – $0.03 |
| Business growth tips    | ~1.1k cached system + ~0.5k–1k   | ~1.2k–2.5k (effort `low`)      | $0.015 – $0.03 |

So roughly ৳2–7 per call. The worst case per user per day at the default
quotas is about $0.6; `AI_GLOBAL_DAILY_LIMIT=2000` caps total spend near
$60–100 a day. Measure real numbers with one live call on a developer
machine (never in CI):

```bash
ANTHROPIC_API_KEY=… corepack pnpm --filter @kaj/backend ai:live-check bn
```

It analyses a made-up idea twice and prints usage and cost (the second
run shows the prompt-cache read). `ai_usage_logs` gives the real figures
once AI is on.

## Tests

`backend/test/ai.spec.ts` (unit) and `backend/test/ai.prisma.e2e-spec.ts`
(HTTP + database, `AUTH_DATABASE_E2E=1`) use a fake `AiClient` and a fake
SDK — no network in CI. They cover the output schemas, redaction, quota
(per user, global, Redis down, release), the subscriber gate, consent,
the disabled flag, refusal / invalid-output fallbacks, retrieval-only
ranking with blocks, and what is (not) sent to the model.

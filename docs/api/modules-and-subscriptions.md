# Modules and subscriptions

Which parts of KAAJ need a subscription. The server decides; the app reads
`GET /subscriptions/me` and shows a paywall only where it says so.

| Module    | What it covers                                                   | Subscription                                |
| --------- | ---------------------------------------------------------------- | ------------------------------------------- |
| Work      | posting jobs, applying, hiring, direct contact, worker discovery | **Paid** (when the subscription gate is on) |
| Learn     | learning opportunities, training, mentors, consultations         | Free                                        |
| Community | groups, sessions, announcements                                  | Free                                        |
| Business  | business profiles, partners, collaboration requests, Ideas       | Free (owner decision, R1)                   |

AI features (P4, for example `AI_IDEA_ANALYSIS`) have their own feature keys and
stay subscriber-only, even though they live next to Business and Ideas.

`GET /subscriptions/me` returns, among other fields:

```json
{
  "accessActive": false,
  "freeModules": ["LEARN", "COMMUNITY", "BUSINESS"],
  "moduleAccess": {
    "WORK": false,
    "BUSINESS": true,
    "LEARN": true,
    "COMMUNITY": true
  }
}
```

- `moduleAccess.WORK` follows `accessActive`; the other three are always `true`.
- A Work route without access answers 403 `SUBSCRIPTION_REQUIRED`.
- A feature key starting with `LEARN_`, `TRAINING_`, `COMMUNITY_` or `BUSINESS_`
  is never gated, whatever the flags or access rules say. Any other key counts
  as Work, so a typo can only make something stricter.

Code: `backend/src/modules/subscriptions/subscription-feature.ts`
(`FREE_MODULES`, `moduleForFeature`).

# API error codes

Every error response has the same envelope:

```json
{
  "error": {
    "code": "ACCOUNT_RESTRICTED",
    "message": "…",
    "messageKey": "error.account.restricted",
    "field": null,
    "details": [],
    "action": null,
    "retryable": false,
    "requestId": "…"
  }
}
```

Clients should branch on `code` (stable), show their own translation for
`messageKey`, and fall back to `message` (English) for unknown keys. The
HTTP status is unchanged from earlier releases; only `code`, `message` and
`messageKey` became more specific.

## Account and access

| HTTP                   | code                      | messageKey                              | English                                                                            | বাংলা                                                                |
| ---------------------- | ------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 403                    | `ACCOUNT_RESTRICTED`      | `error.account.restricted`              | Marketplace actions are temporarily restricted.                                    | আপনার অ্যাকাউন্টে কাজের সুবিধা সাময়িকভাবে সীমিত।                    |
| 403                    | `REVERIFICATION_REQUIRED` | `error.account.reverification_required` | Identity re-verification is required before marketplace actions.                   | কাজ চালিয়ে যেতে আবার পরিচয় যাচাই করুন।                             |
| 403                    | `ACCOUNT_SUSPENDED`       | `error.account.suspended`               | This account is suspended.                                                         | এই অ্যাকাউন্ট স্থগিত আছে।                                            |
| 403                    | `ACCOUNT_UNAVAILABLE`     | `error.account.unavailable`             | This account is unavailable.                                                       | এই অ্যাকাউন্ট ব্যবহার করা যাচ্ছে না।                                 |
| 403                    | `SUBSCRIPTION_REQUIRED`   | `error.subscription.required`           | Your subscription is inactive or expired. Renew it to continue using this feature. | আপনার সাবস্ক্রিপশন চালু নেই বা মেয়াদ শেষ। চালিয়ে যেতে নবায়ন করুন। |
| 403 (409 on chat send) | `USER_BLOCKED`            | `error.safety.blocked`                  | You can't interact with this person.                                               | এই ব্যক্তির সাথে যোগাযোগ করা যাবে না।                                |
| 422                    | `HIRING_UNAVAILABLE`      | `error.job.hiring_unavailable`          | This worker can't be hired for this job.                                           | এই কাজে এই কর্মীকে নেওয়া যাবে না।                                   |
| 403                    | `MESSAGES_NOT_ALLOWED`    | `error.chat.messages_after_hire_only`   | This person accepts messages only after a hire.                                    | এই ব্যক্তি কাজে নিয়োগের পরেই বার্তা গ্রহণ করেন।                     |

Blocks never say who blocked whom. Where a block hides something (feed,
job detail, applicant list, suggestions, public profile, directory,
availability slots) the item is simply absent or 404.

On the chat socket (`message:send`, `conversation:join`) every error,
including account and block errors, arrives as the `exception` event with
the same fields plus `httpStatus`.

## Common

| HTTP | code                                         | messageKey                               | Notes                                                                                                                                                        |
| ---- | -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400  | `VALIDATION_FAILED`                          | `error.validation.failed`                | `field` = first bad field; `details` = `[{field, rules[]}]`                                                                                                  |
| 400  | `BAD_REQUEST`                                | `error.common.bad_request`               | `message` carries the specific reason                                                                                                                        |
| 401  | `UNAUTHORIZED` / auth codes                  | `error.auth.*`                           | sign in again                                                                                                                                                |
| 403  | `FORBIDDEN`                                  | `error.auth.forbidden`                   | generic; `message` may be specific                                                                                                                           |
| 404  | `NOT_FOUND`                                  | `error.common.not_found`                 |                                                                                                                                                              |
| 409  | `CONFLICT`                                   | `error.common.conflict`                  | `message` carries the business rule, e.g. "Only draft jobs can be published."                                                                                |
| 409  | `ALREADY_APPLIED`                            | `error.jobs.already_applied`             | You have already applied to this job. / আপনি এই কাজে আগেই আবেদন করেছেন।                                                                                      |
| 409  | `SLOT_UNAVAILABLE`                           | `error.jobs.slot_unavailable`            | Worker is not available for this slot. (apply, direct booking) / This slot is no longer available. (confirm) — কর্মী এই সময়ে ফাঁকা নেই। অন্য সময় বেছে নিন। |
| 409  | `JOB_TRANSITION_NOT_ALLOWED`                 | `error.admin.job_transition_not_allowed` | Admin console only; `details` = `[{allowedStatus}]`                                                                                                          |
| 409  | `DISPUTE_NOT_ELIGIBLE`                       | `error.dispute.not_eligible`             | This assignment is not eligible for dispute. / এই কাজে অভিযোগ করা যাবে না। Use `canDispute` on GET /assignments/:id to hide the button.                      |
| 409  | `DISPUTE_WINDOW_CLOSED`                      | `error.dispute.window_closed`            | The seven-day dispute window has closed. / অভিযোগ করার সাত দিনের সময় শেষ হয়েছে।                                                                            |
| 409  | `DISPUTE_EXISTS`                             | `error.dispute.exists`                   | This assignment already has a dispute. / এই কাজে আগেই একটি অভিযোগ আছে।                                                                                       |
| 409  | `ALREADY_EXISTS`, `CONCURRENT_UPDATE`        | `error.common.*`                         | `CONCURRENT_UPDATE` is retryable                                                                                                                             |
| 413  | `PAYLOAD_TOO_LARGE`                          | `error.common.payload_too_large`         |                                                                                                                                                              |
| 422  | `BUSINESS_RULE_VIOLATION` and specific codes |                                          |                                                                                                                                                              |
| 429  | `RATE_LIMITED`                               | `error.common.rate_limited`              | `Retry-After` header                                                                                                                                         |
| 500  | `INTERNAL_SERVER_ERROR`                      | `error.common.internal`                  | retryable                                                                                                                                                    |
| 503  | `SERVICE_UNAVAILABLE`                        | `error.common.service_unavailable`       | retryable                                                                                                                                                    |

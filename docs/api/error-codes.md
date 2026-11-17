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

## Learn (P1)

| HTTP | code                           | messageKey                                    | English                                                            | বাংলা                                                                  |
| ---- | ------------------------------ | --------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 403  | `MENTOR_APPROVAL_REQUIRED`     | `error.mentor.approval_required`              | Only approved mentors can do this. Apply to become a mentor first. | শুধু অনুমোদিত মেন্টর এটি করতে পারেন। আগে মেন্টর হওয়ার আবেদন করুন।     |
| 403  | `MENTOR_SUSPENDED`             | `error.mentor.suspended`                      | Your mentor profile is suspended.                                  | আপনার মেন্টর প্রোফাইল স্থগিত আছে।                                      |
| 409  | `IDENTITY_REQUIRED`            | `error.mentor.identity_required`              | Verify your identity (NID and selfie) before applying to mentor.   | মেন্টর হওয়ার আবেদনের আগে পরিচয় (এনআইডি ও সেলফি) যাচাই করুন।          |
| 409  | `MENTOR_APPLICATION_PENDING`   | `error.mentor.application_pending`            | Your mentor application is being reviewed.                         | আপনার মেন্টর আবেদন যাচাই করা হচ্ছে।                                    |
| 409  | `MENTOR_ALREADY_APPROVED`      | `error.mentor.already_approved`               | You are already an approved mentor.                                | আপনি ইতিমধ্যে অনুমোদিত মেন্টর।                                         |
| 400  | `USE_MENTOR_APPLICATION`       | `error.mentor.use_application`                | Apply to become a mentor with POST /me/mentor/application.         | মেন্টর হতে মেন্টর আবেদন ফর্ম ব্যবহার করুন।                             |
| 400  | `REVIEW_SUBJECT_UNSUPPORTED`   | `error.review.subject_unsupported`            | Reviews of this kind are not available yet.                        | এই ধরনের রিভিউ এখনো চালু হয়নি।                                        |
| 409  | `NOT_A_WORK_JOB`               | `error.job.not_work`                          | This is a learning opportunity. Use the learning routes instead.   | এটি একটি শেখার সুযোগ। শেখার অংশ থেকে ব্যবহার করুন।                     |
| 400  | `LEARNING_TERMS_INVALID`       | `error.learning.terms_invalid`                | The fee or stipend doesn't match the terms (`field` says which).   | শর্তের সাথে ফি বা ভাতা মিলছে না।                                       |
| 409  | `OPPORTUNITY_CLOSED`           | `error.learning.closed`                       | This opportunity is not taking applications.                       | এই সুযোগে এখন আবেদন নেওয়া হচ্ছে না।                                   |
| 409  | `OWN_OPPORTUNITY`              | `error.learning.own_opportunity`              | You can't apply to your own opportunity.                           | নিজের সুযোগে আবেদন করা যায় না।                                        |
| 409  | `SEATS_FULL`                   | `error.learning.seats_full`                   | Every seat is taken.                                               | সব আসন পূর্ণ হয়ে গেছে।                                                |
| 409  | `ENROLMENT_NOT_ACTIVE`         | `error.learning.enrolment_not_active`         | Sessions can be recorded only for an active enrolment.             | শুধু চলমান ভর্তির জন্য ক্লাস নথিভুক্ত করা যায়।                        |
| 409  | `APPLICATION_NOT_WITHDRAWABLE` | `error.learning.application_not_withdrawable` | This application can no longer be withdrawn (declined or expired). | এই আবেদন আর প্রত্যাহার করা যায় না।                                    |
| 409  | `REAPPLY_NOT_ALLOWED`          | `error.learning.reapply_not_allowed`          | You left this opportunity after being accepted.                    | ভর্তির পর সরে যাওয়ায় এই সুযোগে আবার আবেদন করা যায় না।               |
| 409  | `SESSION_IN_FUTURE`            | `error.learning.session_in_future`            | Record a session after it has happened.                            | ক্লাস হয়ে যাওয়ার পরে নথিভুক্ত করুন।                                  |
| 409  | `NO_CONFIRMED_SESSIONS`        | `error.learning.no_confirmed_sessions`        | The learner must confirm at least one session before completion.   | সমাপ্তির আগে শিক্ষার্থীকে অন্তত একটি ক্লাসে উপস্থিতি নিশ্চিত করতে হবে। |
| 409  | `COURSE_SLUG_TAKEN`            | `error.training.slug_taken`                   | A course with this slug already exists. (admin)                    | এই স্লাগে আগেই একটি কোর্স আছে।                                         |
| 400  | `COURSE_SLUG_IMMUTABLE`        | `error.training.slug_immutable`               | A course's slug can't change. (admin)                              | কোর্সের স্লাগ বদলানো যায় না।                                          |

## Business (P2)

| HTTP | Code                                   | messageKey                                   | English                                                                          | Bangla                                                          |
| ---- | -------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 409  | `BUSINESS_PROFILE_INCOMPLETE`          | `error.business.profile_incomplete`          | Add a sector and an area before making the business public (`field` says which). | ব্যবসা সবার জন্য প্রকাশের আগে খাত ও এলাকা যোগ করুন।             |
| 409  | `BUSINESS_SUSPENDED`                   | `error.business.suspended`                   | This business is suspended by KAAJ moderation.                                   | এই ব্যবসাটি KAAJ মডারেশন স্থগিত করেছে।                          |
| 409  | `BUSINESS_LIMIT_REACHED`               | `error.business.limit_reached`               | You can own at most 5 businesses.                                                | আপনি সর্বোচ্চ ৫টি ব্যবসার মালিক হতে পারেন।                      |
| 409  | `ALREADY_MEMBER`                       | `error.business.already_member`              | This person is already a member or invited.                                      | এই ব্যক্তি ইতিমধ্যে সদস্য বা আমন্ত্রিত।                         |
| 409  | `LAST_OWNER`                           | `error.business.last_owner`                  | A business needs at least one owner. Add another owner first.                    | ব্যবসার অন্তত একজন মালিক থাকতে হবে। আগে আরেকজন মালিক যোগ করুন।  |
| 409  | `MEMBER_LIMIT_REACHED`                 | `error.business.member_limit`                | A business can have at most 50 members.                                          | একটি ব্যবসায় সর্বোচ্চ ৫০ জন সদস্য থাকতে পারে।                  |
| 400  | `OFFERING_TITLE_REQUIRED`              | `error.business.offering_title_required`     | Give the offering a title in Bangla or English.                                  | অফারের একটি বাংলা বা ইংরেজি নাম দিন।                            |
| 400  | `OFFERING_PRICE_INVALID`               | `error.business.offering_price_invalid`      | The lowest price can't be more than the highest.                                 | সর্বনিম্ন দাম সর্বোচ্চ দামের চেয়ে বেশি হতে পারে না।            |
| 409  | `OFFERING_LIMIT_REACHED`               | `error.business.offering_limit`              | A business can list at most 100 offerings.                                       | একটি ব্যবসা সর্বোচ্চ ১০০টি অফার রাখতে পারে।                     |
| 409  | `OWN_SUBJECT`                          | `error.collaboration.own_subject`            | You can't send a collaboration request to yourself or your own business.         | নিজের বা নিজের ব্যবসায় সহযোগিতার প্রস্তাব পাঠানো যায় না।      |
| 409  | `COLLABORATION_ALREADY_OPEN`           | `error.collaboration.already_open`           | You already have an open request about this.                                     | এ বিষয়ে আপনার একটি প্রস্তাব এখনো চলমান।                        |
| 409  | `COLLABORATION_TRANSITION_NOT_ALLOWED` | `error.collaboration.transition_not_allowed` | That step isn't possible now (`details[0].allowedActions` lists what is).        | এই ধাপ এখন সম্ভব নয়।                                           |
| 400  | `COLLABORATION_SUBJECT_UNSUPPORTED`    | `error.collaboration.subject_unsupported`    | Requests about this kind of subject are not available yet.                       | এই ধরনের বিষয়ে প্রস্তাব এখনো চালু হয়নি।                       |
| 429  | `RATE_LIMITED`                         | `error.collaboration.daily_limit`            | You can send 10 collaboration requests a day. Try again later (`Retry-After`).   | দিনে ১০টি সহযোগিতার প্রস্তাব পাঠানো যায়। পরে আবার চেষ্টা করুন। |
| 400  | `USE_BUSINESS_VERIFICATION`            | `error.business.use_verification`            | Verify a business from its page (POST /businesses/:id/verification, owner only). | ব্যবসার পাতা থেকে ব্যবসা যাচাই করুন (শুধু মালিক)।               |
| 409  | `BUSINESS_NOT_REGISTERED`              | `error.business.not_registered`              | Only a registered business with a trade licence number can be verified.          | শুধু ট্রেড লাইসেন্স নম্বরসহ নিবন্ধিত ব্যবসা যাচাই করা যায়।     |
| 409  | `BUSINESS_ALREADY_VERIFIED`            | `error.business.already_verified`            | This business is already verified.                                               | এই ব্যবসাটি ইতিমধ্যে যাচাই করা।                                 |
| 409  | `BUSINESS_CATEGORY_SLUG_TAKEN`         | `error.business.category_slug_taken`         | A sector with this slug already exists. (admin)                                  | এই স্লাগে আগেই একটি খাত আছে।                                    |

## Ideas (P2)

Anyone without a right to see an idea gets `404 NOT_FOUND` on every idea endpoint.

| HTTP | Code                                 | messageKey                                 | English                                                             | Bangla                                                             |
| ---- | ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 409  | `IDENTITY_REQUIRED`                  | `error.idea.identity_required`             | Verify your identity (NID and selfie) before making an idea public. | আইডিয়া সবার জন্য প্রকাশের আগে পরিচয় (এনআইডি ও সেলফি) যাচাই করুন। |
| 409  | `IDEA_LIMIT_REACHED`                 | `error.idea.limit_reached`                 | You can have at most 20 ideas.                                      | আপনি সর্বোচ্চ ২০টি আইডিয়া রাখতে পারেন।                            |
| 400  | `CONFIDENTIALITY_NOT_ACCEPTED`       | `error.idea.confidentiality_required`      | Accept the confidentiality notice to ask for the details.           | বিস্তারিত চাইতে গোপনীয়তার শর্ত মেনে নিন।                          |
| 409  | `IDEA_ACCESS_ALREADY_GRANTED`        | `error.idea.access_already_granted`        | You can already see this idea's details.                            | আপনি ইতিমধ্যে এই আইডিয়ার বিস্তারিত দেখতে পারেন।                   |
| 409  | `IDEA_ACCESS_ALREADY_REQUESTED`      | `error.idea.access_already_requested`      | You already asked; the owner hasn't answered yet.                   | আপনি আগেই অনুরোধ করেছেন; মালিক এখনো উত্তর দেননি।                   |
| 409  | `IDEA_ACCESS_TRANSITION_NOT_ALLOWED` | `error.idea.access_transition_not_allowed` | That access request can't be changed this way.                      | এই অনুরোধটি এভাবে বদলানো যায় না।                                  |
| 409  | `IDEA_ROLE_LIMIT_REACHED`            | `error.idea.role_limit`                    | An idea can seek at most 10 roles.                                  | একটি আইডিয়ায় সর্বোচ্চ ১০টি ভূমিকা চাওয়া যায়।                   |
| 409  | `IDEA_ROLE_NOT_OPEN`                 | `error.idea.role_not_open`                 | This role is no longer open.                                        | এই ভূমিকাটি আর খোলা নেই।                                           |
| 409  | `COLLABORATION_NOT_AGREED`           | `error.idea.collaboration_not_agreed`      | Add a team member from a collaboration request you both agreed.     | দুজনে সম্মত হওয়া প্রস্তাব থেকে দলের সদস্য যোগ করুন।               |
| 409  | `IDEA_ALREADY_CONVERTED`             | `error.idea.already_converted`             | This idea is already a business.                                    | এই আইডিয়া ইতিমধ্যে একটি ব্যবসা।                                   |
| 429  | `RATE_LIMITED`                       | `error.idea.daily_limit`                   | You can ask about 10 ideas a day. Try again later.                  | দিনে ১০টি আইডিয়ার বিস্তারিত চাওয়া যায়। পরে আবার চেষ্টা করুন।    |

## Experts & Community (P3)

| HTTP | Code                                  | messageKey                                  | English                                                                                 | Bangla                                                      |
| ---- | ------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 409  | `INTRODUCTION_ALREADY_PENDING`        | `error.introduction.already_pending`        | You already have a pending request to this expert.                                      | এই বিশেষজ্ঞের কাছে আপনার একটি অনুরোধ এখনো অপেক্ষমাণ।        |
| 409  | `INTRODUCTION_TRANSITION_NOT_ALLOWED` | `error.introduction.transition_not_allowed` | That step isn't possible now (`details[0].allowedActions`).                             | এই ধাপ এখন সম্ভব নয়।                                       |
| 409  | `IDEA_ACCESS_OWNER_ONLY`              | `error.introduction.idea_access_owner_only` | Only the idea's owner can offer access to its details.                                  | শুধু আইডিয়ার মালিক বিস্তারিত দেখার অনুমতি দিতে পারেন।      |
| 429  | `RATE_LIMITED`                        | `error.introduction.daily_limit`            | You can send 5 introduction requests a day. Try again later.                            | দিনে ৫টি পরিচয়ের অনুরোধ পাঠানো যায়। পরে আবার চেষ্টা করুন। |
| 409  | `SESSION_TRANSITION_NOT_ALLOWED`      | `error.session.transition_not_allowed`      | Not possible in the session's current state (`details[0].status`).                      | সেশনের বর্তমান অবস্থায় এটি সম্ভব নয়।                      |
| 409  | `SESSION_FULL`                        | `error.session.full`                        | Every place in this session is taken.                                                   | এই সেশনের সব জায়গা পূর্ণ।                                  |
| 409  | `SESSION_DETAILS_INVALID`             | `error.session.details_invalid`             | A detail is missing or invalid (`field` says which: area, link, price, time, capacity). | একটি তথ্য নেই বা ভুল (`field` দেখুন)।                       |
| 409  | `SESSION_NOT_STARTED`                 | `error.session.not_started`                 | Mark attendance or complete the session once it has started.                            | সেশন শুরু হওয়ার পর উপস্থিতি বা সমাপ্তি দিন।                |
| 409  | `WOMEN_ONLY`                          | `error.session.women_only`                  | This is a women-only session (open to profiles marked female).                          | এটি শুধু নারীদের সেশন।                                      |
| 409  | `SLOT_UNAVAILABLE`                    | `error.jobs.slot_unavailable`               | The expert isn't available at that time.                                                | বিশেষজ্ঞ ওই সময়ে ফাঁকা নেই।                                |
| 409  | `REVIEW_NOT_ALLOWED`                  | `error.review.not_allowed`                  | Feedback opens for people who attended, once the session is completed.                  | সেশন শেষ হলে উপস্থিত অংশগ্রহণকারীরা মতামত দিতে পারেন।       |

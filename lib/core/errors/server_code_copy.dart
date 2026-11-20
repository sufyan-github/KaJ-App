// ignore_for_file: prefer_single_quotes

// Generated from the backend docs/api/error-codes.md (all sections, at
// e3d6428) plus a few Work codes the doc does not list. Bangla and English
// for stable server codes that have no hand-written copy in
// serverCodeMessage.

/// Code to (Bangla, English).
const serverCodeCopy = <String, ({String bn, String en})>{
  "AI_DISABLED": (
    bn: "এই মুহূর্তে AI সুবিধা পাওয়া যাচ্ছে না।",
    en: "AI features are not available right now.",
  ),
  "AI_UNAVAILABLE": (
    bn: "AI সহকারী এখন ব্যস্ত। কয়েক মিনিট পরে আবার চেষ্টা করুন।",
    en: "The AI assistant is busy. Please try again in a few minutes.",
  ),
  "AI_CONSENT_REQUIRED": (
    bn: "আগে আপনার তথ্য দিয়ে AI ব্যবহারের অনুমতি দিন।",
    en: "Allow KAAJ to use AI with your information first.",
  ),
  "AI_CONSENT_VERSION_MISMATCH": (
    bn: "অনুমতির লেখা বদলেছে। অ্যাপ হালনাগাদ করে নতুন লেখাটি দেখুন।",
    en: "The consent text has changed. Update the app to see the latest version.",
  ),
  "AI_IDEA_CONSENT_REQUIRED": (
    bn: "আগে এই আইডিয়ার জন্য AI বিশ্লেষণ চালু করুন।",
    en: "Turn on AI analysis for this idea first.",
  ),
  "AI_DECLINED": (
    bn: "AI সহকারী এটি বিশ্লেষণ করতে পারেনি। লেখা বদলে আবার চেষ্টা করুন।",
    en: "The AI assistant could not analyse this. Edit the text and try again.",
  ),
  "AI_QUOTA_EXCEEDED": (
    bn: "আজকের AI অনুরোধ শেষ।",
    en: "You have used today's AI requests for this feature.",
  ),
  "ACCOUNT_RESTRICTED": (
    bn: "আপনার অ্যাকাউন্টে কাজের সুবিধা সাময়িকভাবে সীমিত।",
    en: "Marketplace actions are temporarily restricted.",
  ),
  "ACCOUNT_SUSPENDED": (
    bn: "এই অ্যাকাউন্ট স্থগিত আছে।",
    en: "This account is suspended.",
  ),
  "ACCOUNT_UNAVAILABLE": (
    bn: "এই অ্যাকাউন্ট ব্যবহার করা যাচ্ছে না।",
    en: "This account is unavailable.",
  ),
  "ALREADY_MEMBER": (
    bn: "এই ব্যক্তি ইতিমধ্যে সদস্য বা আমন্ত্রিত।",
    en: "This person is already a member or invited.",
  ),
  "APPLICATION_NOT_WITHDRAWABLE": (
    bn: "এই আবেদন আর প্রত্যাহার করা যায় না।",
    en: "This application can no longer be withdrawn (declined or expired).",
  ),
  "BUSINESS_ALREADY_VERIFIED": (
    bn: "এই ব্যবসাটি ইতিমধ্যে যাচাই করা।",
    en: "This business is already verified.",
  ),
  "BUSINESS_CATEGORY_SLUG_TAKEN": (
    bn: "এই স্লাগে আগেই একটি খাত আছে।",
    en: "A sector with this slug already exists. (admin)",
  ),
  "BUSINESS_LIMIT_REACHED": (
    bn: "আপনি সর্বোচ্চ ৫টি ব্যবসার মালিক হতে পারেন।",
    en: "You can own at most 5 businesses.",
  ),
  "BUSINESS_NOT_REGISTERED": (
    bn: "শুধু ট্রেড লাইসেন্স নম্বরসহ নিবন্ধিত ব্যবসা যাচাই করা যায়।",
    en: "Only a registered business with a trade licence number can be verified.",
  ),
  "BUSINESS_PROFILE_INCOMPLETE": (
    bn: "ব্যবসা সবার জন্য প্রকাশের আগে খাত ও এলাকা যোগ করুন।",
    en: "Add a sector and an area before making the business public.",
  ),
  "BUSINESS_SUSPENDED": (
    bn: "এই ব্যবসাটি KAAJ মডারেশন স্থগিত করেছে।",
    en: "This business is suspended by KAAJ moderation.",
  ),
  "CATEGORY_POLICY_UNMET": (
    bn: "এই ধরনের কাজের শর্ত পূরণ হয়নি। প্রয়োজনীয় যাচাই শেষ করে আবার চেষ্টা করুন।",
    en: "The rules for this type of work are not met. Finish the required verification and try again.",
  ),
  "COLLABORATION_ALREADY_OPEN": (
    bn: "এ বিষয়ে আপনার একটি প্রস্তাব এখনো চলমান।",
    en: "You already have an open request about this.",
  ),
  "COLLABORATION_NOT_AGREED": (
    bn: "দুজনে সম্মত হওয়া প্রস্তাব থেকে দলের সদস্য যোগ করুন।",
    en: "Add a team member from a collaboration request you both agreed.",
  ),
  "COLLABORATION_SUBJECT_UNSUPPORTED": (
    bn: "এই ধরনের বিষয়ে প্রস্তাব এখনো চালু হয়নি।",
    en: "Requests about this kind of subject are not available yet.",
  ),
  "COLLABORATION_TRANSITION_NOT_ALLOWED": (
    bn: "এই ধাপ এখন সম্ভব নয়।",
    en: "That step isn't possible now.",
  ),
  "CONFIDENTIALITY_NOT_ACCEPTED": (
    bn: "বিস্তারিত চাইতে গোপনীয়তার শর্ত মেনে নিন।",
    en: "Accept the confidentiality notice to ask for the details.",
  ),
  "COURSE_SLUG_IMMUTABLE": (
    bn: "কোর্সের স্লাগ বদলানো যায় না।",
    en: "A course's slug can't change. (admin)",
  ),
  "COURSE_SLUG_TAKEN": (
    bn: "এই স্লাগে আগেই একটি কোর্স আছে।",
    en: "A course with this slug already exists. (admin)",
  ),
  "ENROLMENT_NOT_ACTIVE": (
    bn: "শুধু চলমান ভর্তির জন্য ক্লাস নথিভুক্ত করা যায়।",
    en: "Sessions can be recorded only for an active enrolment.",
  ),
  "GENDER_RESTRICTION_NOT_ALLOWED": (
    bn: "কাজ কোনো এক লিঙ্গের জন্য সীমিত করা যায় না। কাজ ও শর্তগুলো লিখুন।",
    en: "Jobs can't be limited to one gender. Describe the work and the conditions instead (`field`: title or description).",
  ),
  "GROUP_LIMIT_REACHED": (
    bn: "আপনি সর্বোচ্চ ৫টি দল শুরু করতে পারেন।",
    en: "You can start at most 5 groups.",
  ),
  "GROUP_MEMBERSHIP_TRANSITION_NOT_ALLOWED": (
    bn: "এই সদস্যপদে এখন এটি সম্ভব নয়।",
    en: "That isn't possible for this membership now.",
  ),
  "HIRING_UNAVAILABLE": (
    bn: "এই কাজে এই কর্মীকে নেওয়া যাবে না।",
    en: "This worker can't be hired for this job.",
  ),
  "IDEA_ACCESS_ALREADY_GRANTED": (
    bn: "আপনি ইতিমধ্যে এই আইডিয়ার বিস্তারিত দেখতে পারেন।",
    en: "You can already see this idea's details.",
  ),
  "IDEA_ACCESS_ALREADY_REQUESTED": (
    bn: "আপনি আগেই অনুরোধ করেছেন; মালিক এখনো উত্তর দেননি।",
    en: "You already asked; the owner hasn't answered yet.",
  ),
  "IDEA_ACCESS_OWNER_ONLY": (
    bn: "শুধু আইডিয়ার মালিক বিস্তারিত দেখার অনুমতি দিতে পারেন।",
    en: "Only the idea's owner can offer access to its details.",
  ),
  "IDEA_ACCESS_TRANSITION_NOT_ALLOWED": (
    bn: "এই অনুরোধটি এভাবে বদলানো যায় না।",
    en: "That access request can't be changed this way.",
  ),
  "IDEA_ALREADY_CONVERTED": (
    bn: "এই আইডিয়া ইতিমধ্যে একটি ব্যবসা।",
    en: "This idea is already a business.",
  ),
  "IDEA_LIMIT_REACHED": (
    bn: "আপনি সর্বোচ্চ ২০টি আইডিয়া রাখতে পারেন।",
    en: "You can have at most 20 ideas.",
  ),
  "IDEA_ROLE_LIMIT_REACHED": (
    bn: "একটি আইডিয়ায় সর্বোচ্চ ১০টি ভূমিকা চাওয়া যায়।",
    en: "An idea can seek at most 10 roles.",
  ),
  "IDEA_ROLE_NOT_OPEN": (
    bn: "এই ভূমিকাটি আর খোলা নেই।",
    en: "This role is no longer open.",
  ),
  "IDENTITY_REQUIRED": (
    bn: "আগে আপনার পরিচয় (এনআইডি ও সেলফি) যাচাই করুন।",
    en: "Verify your identity (NID and selfie) first.",
  ),
  "INTRODUCTION_ALREADY_PENDING": (
    bn: "এই বিশেষজ্ঞের কাছে আপনার একটি অনুরোধ এখনো অপেক্ষমাণ।",
    en: "You already have a pending request to this expert.",
  ),
  "INTRODUCTION_TRANSITION_NOT_ALLOWED": (
    bn: "এই ধাপ এখন সম্ভব নয়।",
    en: "That step isn't possible now (`details[0].allowedActions`).",
  ),
  "JOB_ALERT_FILTER_UNAVAILABLE": (
    bn: "এই ফিল্টার দিয়ে সতর্কবার্তা রাখা যায় না। অন্য এলাকা বা দক্ষতা বেছে নিন।",
    en: "An alert cannot use this filter. Pick another area or skill.",
  ),
  "LAST_MODERATOR": (
    bn: "দলে অন্তত একজন মডারেটর থাকতে হবে। আগে আরেকজন যোগ করুন।",
    en: "A group needs at least one moderator. Add another first.",
  ),
  "LAST_OWNER": (
    bn: "ব্যবসার অন্তত একজন মালিক থাকতে হবে। আগে আরেকজন মালিক যোগ করুন।",
    en: "A business needs at least one owner. Add another owner first.",
  ),
  "LEARNING_TERMS_INVALID": (
    bn: "শর্তের সাথে ফি বা ভাতা মিলছে না।",
    en: "The fee or stipend doesn't match the terms (`field` says which).",
  ),
  "MEMBER_LIMIT_REACHED": (
    bn: "একটি ব্যবসায় সর্বোচ্চ ৫০ জন সদস্য থাকতে পারে।",
    en: "A business can have at most 50 members.",
  ),
  "MENTOR_ALREADY_APPROVED": (
    bn: "আপনি ইতিমধ্যে অনুমোদিত মেন্টর।",
    en: "You are already an approved mentor.",
  ),
  "MENTOR_APPLICATION_PENDING": (
    bn: "আপনার মেন্টর আবেদন যাচাই করা হচ্ছে।",
    en: "Your mentor application is being reviewed.",
  ),
  "MENTOR_APPROVAL_REQUIRED": (
    bn: "শুধু অনুমোদিত মেন্টর এটি করতে পারেন। আগে মেন্টর হওয়ার আবেদন করুন।",
    en: "Only approved mentors can do this. Apply to become a mentor first.",
  ),
  "MENTOR_SUSPENDED": (
    bn: "আপনার মেন্টর প্রোফাইল স্থগিত আছে।",
    en: "Your mentor profile is suspended.",
  ),
  "MESSAGES_NOT_ALLOWED": (
    bn: "এই ব্যক্তি কাজে নিয়োগের পরেই বার্তা গ্রহণ করেন।",
    en: "This person accepts messages only after a hire.",
  ),
  "MULTI_WORKER_NOT_SUPPORTED": (
    bn: "এই কাজে এখন একজন কর্মীই নেওয়া যায়।",
    en: "This job can take only one worker for now.",
  ),
  "NOT_A_WORK_JOB": (
    bn: "এটি একটি শেখার সুযোগ। শেখার অংশ থেকে ব্যবহার করুন।",
    en: "This is a learning opportunity. Use the learning routes instead.",
  ),
  "NO_CONFIRMED_SESSIONS": (
    bn: "সমাপ্তির আগে শিক্ষার্থীকে অন্তত একটি ক্লাসে উপস্থিতি নিশ্চিত করতে হবে।",
    en: "The learner must confirm at least one session before completion.",
  ),
  "OFFERING_LIMIT_REACHED": (
    bn: "একটি ব্যবসা সর্বোচ্চ ১০০টি অফার রাখতে পারে।",
    en: "A business can list at most 100 offerings.",
  ),
  "OFFERING_PRICE_INVALID": (
    bn: "সর্বনিম্ন দাম সর্বোচ্চ দামের চেয়ে বেশি হতে পারে না।",
    en: "The lowest price can't be more than the highest.",
  ),
  "OFFERING_TITLE_REQUIRED": (
    bn: "অফারের একটি বাংলা বা ইংরেজি নাম দিন।",
    en: "Give the offering a title in Bangla or English.",
  ),
  "OPPORTUNITY_CLOSED": (
    bn: "এই সুযোগে এখন আবেদন নেওয়া হচ্ছে না।",
    en: "This opportunity is not taking applications.",
  ),
  "OWN_OPPORTUNITY": (
    bn: "নিজের সুযোগে আবেদন করা যায় না।",
    en: "You can't apply to your own opportunity.",
  ),
  "OWN_SUBJECT": (
    bn: "নিজের বা নিজের ব্যবসায় সহযোগিতার প্রস্তাব পাঠানো যায় না।",
    en: "You can't send a collaboration request to yourself or your own business.",
  ),
  "RATE_LIMITED": (
    bn: "দিনে ১০টি সহযোগিতার প্রস্তাব পাঠানো যায়। পরে আবার চেষ্টা করুন।",
    en: "You can send 10 collaboration requests a day. Try again later (`Retry-After`).",
  ),
  "REAPPLY_NOT_ALLOWED": (
    bn: "ভর্তির পর সরে যাওয়ায় এই সুযোগে আবার আবেদন করা যায় না।",
    en: "You left this opportunity after being accepted.",
  ),
  "REMOVED_FROM_GROUP": (
    bn: "একজন মডারেটর আপনাকে এই দল থেকে সরিয়েছেন।",
    en: "A moderator removed you from this group.",
  ),
  "REVERIFICATION_REQUIRED": (
    bn: "কাজ চালিয়ে যেতে আবার পরিচয় যাচাই করুন।",
    en: "Identity re-verification is required before marketplace actions.",
  ),
  "REVIEW_NOT_ALLOWED": (
    bn: "সেশন শেষ হলে উপস্থিত অংশগ্রহণকারীরা মতামত দিতে পারেন।",
    en: "Feedback opens for people who attended, once the session is completed.",
  ),
  "REVIEW_SUBJECT_UNSUPPORTED": (
    bn: "এই ধরনের রিভিউ এখনো চালু হয়নি।",
    en: "Reviews of this kind are not available yet.",
  ),
  "ROLE_REQUIRED": (
    bn: "এই কাজের অনুমতি আপনার অ্যাকাউন্টে এখনো চালু হয়নি। নতুন অনুমোদন হলে কয়েক মিনিট পরে আবার চেষ্টা করুন।",
    en: "Your account does not have this permission yet. If it was just approved, try again in a few minutes.",
  ),
  "SEATS_FULL": (bn: "সব আসন পূর্ণ হয়ে গেছে।", en: "Every seat is taken."),
  "SESSION_DETAILS_INVALID": (
    bn: "একটি তথ্য নেই বা ভুল (`field` দেখুন)।",
    en: "A detail is missing or invalid (`field` says which: area, link, price, time, capacity).",
  ),
  "SESSION_FULL": (
    bn: "এই সেশনের সব জায়গা পূর্ণ।",
    en: "Every place in this session is taken.",
  ),
  "SESSION_IN_FUTURE": (
    bn: "ক্লাস হয়ে যাওয়ার পরে নথিভুক্ত করুন।",
    en: "Record a session after it has happened.",
  ),
  "SESSION_NOT_STARTED": (
    bn: "সেশন শুরু হওয়ার পর উপস্থিতি বা সমাপ্তি দিন।",
    en: "Mark attendance or complete the session once it has started.",
  ),
  "SESSION_TRANSITION_NOT_ALLOWED": (
    bn: "সেশনের বর্তমান অবস্থায় এটি সম্ভব নয়।",
    en: "Not possible in the session's current state (`details[0].status`).",
  ),
  "SLOT_IN_PAST": (
    bn: "এই সময় পেরিয়ে গেছে। পরের কোনো সময় বেছে নিন।",
    en: "That time has passed. Pick a later time.",
  ),
  "SLOT_UNAVAILABLE": (
    bn: "বিশেষজ্ঞ ওই সময়ে ফাঁকা নেই।",
    en: "The expert isn't available at that time.",
  ),
  "SUBSCRIPTION_REQUIRED": (
    bn: "আপনার সাবস্ক্রিপশন চালু নেই বা মেয়াদ শেষ। চালিয়ে যেতে নবায়ন করুন।",
    en: "Your subscription is inactive or expired. Renew it to continue using this feature.",
  ),
  "TRAINING_ANSWER_INVALID": (
    bn: "কিছু উত্তর বোঝা যায়নি। প্রশ্নগুলো আবার দেখুন।",
    en: "Some answers could not be read. Check the questions again.",
  ),
  "TRAINING_ATTEMPT_EXPIRED": (
    bn: "পরীক্ষার সময় শেষ হয়ে গেছে। নতুন করে শুরু করুন।",
    en: "The test time is over. Start again.",
  ),
  "TRAINING_ATTEMPT_SUBMITTED": (
    bn: "এই পরীক্ষা আগেই জমা হয়েছে।",
    en: "This test was already submitted.",
  ),
  "TRAINING_TEST_UNAVAILABLE": (
    bn: "এই কোর্সের পরীক্ষা এখন নেওয়া যাচ্ছে না।",
    en: "The test for this course is not available now.",
  ),
  "UPLOAD_CONTENT_INVALID": (
    bn: "ফাইলটি ছবি হিসেবে পড়া যায়নি। অন্য ছবি দিন।",
    en: "The file could not be read as an image. Use another photo.",
  ),
  "UPLOAD_KEY_INVALID": (
    bn: "আপলোড সম্পূর্ণ হয়নি। আবার চেষ্টা করুন।",
    en: "The upload did not finish. Try again.",
  ),
  "UPLOAD_METADATA_MISMATCH": (
    bn: "আপলোড সম্পূর্ণ হয়নি। আবার চেষ্টা করুন।",
    en: "The upload did not finish. Try again.",
  ),
  "UPLOAD_REQUEST_INVALID": (
    bn: "এই ধরনের ফাইল আপলোড করা যায় না।",
    en: "This type of file cannot be uploaded.",
  ),
  "UPLOAD_SIZE_MISMATCH": (
    bn: "আপলোড সম্পূর্ণ হয়নি। আবার চেষ্টা করুন।",
    en: "The upload did not finish. Try again.",
  ),
  "USER_BLOCKED": (
    bn: "এই ব্যক্তির সাথে যোগাযোগ করা যাবে না।",
    en: "You can't interact with this person.",
  ),
  "USE_BUSINESS_VERIFICATION": (
    bn: "ব্যবসার পাতা থেকে ব্যবসা যাচাই করুন (শুধু মালিক)।",
    en: "Verify a business from its page (POST /businesses/:id/verification, owner only).",
  ),
  "USE_MENTOR_APPLICATION": (
    bn: "মেন্টর হতে মেন্টর আবেদন ফর্ম ব্যবহার করুন।",
    en: "Apply to become a mentor with POST /me/mentor/application.",
  ),
  "WOMEN_ONLY": (
    bn: "এটি শুধু নারীদের সেশন।",
    en: "This is a women-only session (open to profiles marked female).",
  ),
  "WORKER_ROLE_REQUIRED": (
    bn: "এটি করতে কাজের মোড চালু করুন।",
    en: "Turn on work mode to do this.",
  ),
};

// ignore_for_file: prefer_single_quotes

// Generated from the backend docs/api/error-codes.md (Learn, Business and
// Ideas sections). Bangla and English for stable server codes that have no
// hand-written copy in serverCodeMessage.

/// Code → (Bangla, English).
const serverCodeCopy = <String, ({String bn, String en})>{
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
  "IDEA_ACCESS_ALREADY_GRANTED": (
    bn: "আপনি ইতিমধ্যে এই আইডিয়ার বিস্তারিত দেখতে পারেন।",
    en: "You can already see this idea's details.",
  ),
  "IDEA_ACCESS_ALREADY_REQUESTED": (
    bn: "আপনি আগেই অনুরোধ করেছেন; মালিক এখনো উত্তর দেননি।",
    en: "You already asked; the owner hasn't answered yet.",
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
  "LAST_OWNER": (
    bn: "ব্যবসার অন্তত একজন মালিক থাকতে হবে। আগে আরেকজন মালিক যোগ করুন।",
    en: "A business needs at least one owner. Add another owner first.",
  ),
  "MEMBER_LIMIT_REACHED": (
    bn: "একটি ব্যবসায় সর্বোচ্চ ৫০ জন সদস্য থাকতে পারে।",
    en: "A business can have at most 50 members.",
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
  "OWN_SUBJECT": (
    bn: "নিজের বা নিজের ব্যবসায় সহযোগিতার প্রস্তাব পাঠানো যায় না।",
    en: "You can't send a collaboration request to yourself or your own business.",
  ),
  "REAPPLY_NOT_ALLOWED": (
    bn: "ভর্তির পর সরে যাওয়ায় এই সুযোগে আবার আবেদন করা যায় না।",
    en: "You left this opportunity after being accepted.",
  ),
  "REVIEW_SUBJECT_UNSUPPORTED": (
    bn: "এই ধরনের রিভিউ এখনো চালু হয়নি।",
    en: "Reviews of this kind are not available yet.",
  ),
  "USE_BUSINESS_VERIFICATION": (
    bn: "ব্যবসার পাতা থেকে ব্যবসা যাচাই করুন (শুধু মালিক)।",
    en: "Verify a business from its page (POST /businesses/:id/verification, owner only).",
  ),
  "USE_MENTOR_APPLICATION": (
    bn: "মেন্টর হতে মেন্টর আবেদন ফর্ম ব্যবহার করুন।",
    en: "Apply to become a mentor with POST /me/mentor/application.",
  ),
};

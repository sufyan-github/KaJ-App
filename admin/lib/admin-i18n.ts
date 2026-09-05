import { generatedAdminBangla } from "./generated-admin-translations";

export type AdminLocale = "bn" | "en";

let activeLocale: AdminLocale = "en";

const reviewedBangla: Record<string, string> = {
  Active: "সক্রিয়",
  Actioned: "ব্যবস্থা নেওয়া হয়েছে",
  Admin: "প্রশাসক",
  Applications: "আবেদন",
  "Applications open": "আবেদন গ্রহণ চলছে",
  "Apply to a job": "কাজে আবেদন করুন",
  Approved: "অনুমোদিত",
  Accepted: "গৃহীত",
  Assigned: "নিয়োগ দেওয়া হয়েছে",
  "Audit trail": "অডিট ইতিহাস",
  "Campaign dry-runs": "ক্যাম্পেইন যাচাই",
  Categories: "কাজের ধরন",
  Cancelled: "বাতিল",
  "Cancelled by customer": "গ্রাহক বাতিল করেছেন",
  "Cancelled by worker": "কর্মী বাতিল করেছেন",
  Cleared: "ঝুঁকিমুক্ত",
  Completed: "সম্পন্ন",
  Confirmed: "নিশ্চিত",
  "Confirmation pending": "নিশ্চিতকরণের অপেক্ষায়",
  "Customer review": "গ্রাহকের পর্যালোচনা",
  Customer: "গ্রাহক",
  Configuration: "কনফিগারেশন",
  Dashboard: "ড্যাশবোর্ড",
  Disputes: "বিরোধ",
  Dismissed: "খারিজ",
  Declined: "প্রত্যাখ্যাত",
  Draft: "খসড়া",
  "Direct contact": "সরাসরি যোগাযোগ",
  "Document review queue": "নথি পর্যালোচনার তালিকা",
  "Evidence and resolution": "প্রমাণ ও সমাধান",
  "Feature flags": "ফিচার নিয়ন্ত্রণ",
  "Human review and progressive action": "মানব পর্যালোচনা ও ধাপে ব্যবস্থা",
  Jobs: "কাজ",
  "Job application": "কাজের আবেদন",
  "Job posting": "কাজ প্রকাশ",
  "Checked in": "উপস্থিতি নিশ্চিত",
  "In progress": "কাজ চলছে",
  "Launch service areas": "সেবার এলাকা চালু করুন",
  "Lifecycle rescue": "আটকে থাকা কাজ সচল করুন",
  "Live marketplace health": "মার্কেটপ্লেসের বর্তমান অবস্থা",
  Locations: "এলাকা",
  Notifications: "নোটিফিকেশন",
  Open: "খোলা",
  Expired: "মেয়াদ শেষ",
  Flexible: "সময় নমনীয়",
  Normal: "সাধারণ",
  Urgent: "জরুরি",
  "Not submitted": "জমা দেওয়া হয়নি",
  Shortlisted: "সংক্ষিপ্ত তালিকাভুক্ত",
  Submitted: "জমা দেওয়া হয়েছে",
  Upcoming: "আসন্ন",
  Withdrawn: "প্রত্যাহার করা হয়েছে",
  "Worker selected": "কর্মী নির্বাচিত",
  "Worker discovery": "কর্মী খোঁজা",
  "Worker hiring": "কর্মী নিয়োগ",
  Pending: "অপেক্ষমাণ",
  "Percentage rollouts": "শতকরা হারে চালু করুন",
  "Preview and revert": "আগে দেখুন ও ফিরিয়ে নিন",
  Published: "প্রকাশিত",
  "Profile incomplete": "প্রোফাইল অসম্পূর্ণ",
  Reviewed: "পর্যালোচিত",
  Scheduled: "সময় নির্ধারিত",
  Rejected: "প্রত্যাখ্যাত",
  "Refund full": "সম্পূর্ণ ফেরত",
  "Refund partial": "আংশিক ফেরত",
  "Release full": "কর্মীকে সম্পূর্ণ দিন",
  "Release partial": "কর্মীকে আংশিক দিন",
  Restricted: "সীমিত",
  "Risk review": "ঝুঁকি পর্যালোচনা",
  "Safety reports": "নিরাপত্তা রিপোর্ট",
  "Secure session · 30 min": "নিরাপদ সেশন · ৩০ মিনিট",
  "Support and moderation": "সহায়তা ও নিয়ন্ত্রণ",
  Suspended: "স্থগিত",
  Area: "এলাকা",
  City: "শহর",
  Thana: "থানা",
  Worker: "কর্মী",
  Business: "ব্যবসা",
  "Under review": "পর্যালোচনাধীন",
  "Unstick applications": "আটকে থাকা আবেদন সচল করুন",
  Users: "ব্যবহারকারী",
  Verification: "যাচাইকরণ",
  "Who changed what": "কে কী পরিবর্তন করেছেন",
  Subscriptions: "সাবস্ক্রিপশন",
  "Plans and operator access": "প্ল্যান ও অপারেটর সুবিধা",
  "Job payments": "কাজের পেমেন্ট",
  "Offline cash payment oversight": "অফলাইন নগদ পেমেন্ট তদারকি",
  "Active subscriptions": "সক্রিয় সাবস্ক্রিপশন",
  "Pending requests": "অপেক্ষমাণ অনুরোধ",
  "Verified operators": "যাচাইকৃত অপারেটর",
  "No automatic operator charging": "স্বয়ংক্রিয় অপারেটর চার্জ নেই",
  "Version 1 records requests only. Prefix detection is never treated as operator verification.":
    "প্রথম সংস্করণ শুধু অনুরোধ রেকর্ড করে। নম্বরের প্রিফিক্সকে কখনো অপারেটর যাচাই হিসেবে ধরা হয় না।",
  "Subscription plans": "সাবস্ক্রিপশন প্ল্যান",
  "Create pricing only after the commercial plan is approved":
    "বাণিজ্যিক পরিকল্পনা অনুমোদনের পরই মূল্য তৈরি করুন",
  plans: "প্ল্যান",
  "Create plan": "প্ল্যান তৈরি করুন",
  Plan: "প্ল্যান",
  Price: "মূল্য",
  Duration: "মেয়াদ",
  Access: "সুবিধা",
  Inactive: "নিষ্ক্রিয়",
  days: "দিন",
  "Access rules": "সুবিধার নিয়ম",
  "Rules apply only when subscriptions_enabled reaches full rollout":
    "subscriptions_enabled সম্পূর্ণভাবে চালু হলেই নিয়মগুলো প্রযোজ্য হবে",
  Feature: "সুবিধা",
  "Subscription required": "সাবস্ক্রিপশন আবশ্যক",
  "Rule status": "নিয়মের অবস্থা",
  Yes: "হ্যাঁ",
  No: "না",
  "Make optional": "ঐচ্ছিক করুন",
  "Require subscription": "সাবস্ক্রিপশন আবশ্যক করুন",
  Subscribers: "সাবস্ক্রাইবার",
  "Subscription payment records are separate from job payments":
    "সাবস্ক্রিপশন পেমেন্ট কাজের পেমেন্ট থেকে আলাদা",
  Person: "ব্যক্তি",
  Operator: "অপারেটর",
  Payment: "পেমেন্ট",
  "Confirm external payment and activate":
    "বাইরে পেমেন্ট নিশ্চিত করে সক্রিয় করুন",
  "Confirm payment, verify operator and activate subscription":
    "পেমেন্ট ও অপারেটর যাচাই করে সাবস্ক্রিপশন সক্রিয় করুন",
  "Use this only after payment and operator eligibility were verified outside KAAJ. This is a manual record, not an online charge.":
    "KAAJ-এর বাইরে পেমেন্ট ও অপারেটর যোগ্যতা যাচাই করার পরেই এটি ব্যবহার করুন। এটি ম্যানুয়াল রেকর্ড, অনলাইন চার্জ নয়।",
  "Cancel subscription": "সাবস্ক্রিপশন বাতিল করুন",
  "Confirm cancellation": "বাতিল নিশ্চিত করুন",
  "Update access rule": "সুবিধার নিয়ম হালনাগাদ করুন",
  "Create subscription plan": "সাবস্ক্রিপশন প্ল্যান তৈরি করুন",
  "Edit subscription plan": "সাবস্ক্রিপশন প্ল্যান সম্পাদনা করুন",
  "Edit plan": "প্ল্যান সম্পাদনা করুন",
  "Save plan": "প্ল্যান সংরক্ষণ করুন",
  "Updating…": "হালনাগাদ হচ্ছে…",
  "Plan code": "প্ল্যান কোড",
  "Duration in days": "দিনে মেয়াদ",
  "English name": "ইংরেজি নাম",
  "Bangla name": "বাংলা নাম",
  "Price in BDT": "মূল্য (টাকা)",
  "English description": "ইংরেজি বিবরণ",
  "Bangla description": "বাংলা বিবরণ",
  "Included marketplace access": "অন্তর্ভুক্ত মার্কেটপ্লেস সুবিধা",
  "Make plan visible immediately": "প্ল্যান এখনই দৃশ্যমান করুন",
  "Pending cash payments": "অপেক্ষমাণ নগদ পেমেন্ট",
  "Cash payments recorded": "রেকর্ড হওয়া নগদ পেমেন্ট",
  "Disputed payments": "বিরোধযুক্ত পেমেন্ট",
  "Cash on completion only": "শুধু কাজ শেষে নগদ পেমেন্ট",
  "Online payments, mobile banking, wallets and withdrawals are coming soon and are not connected.":
    "অনলাইন পেমেন্ট, মোবাইল ব্যাংকিং, ওয়ালেট ও উত্তোলন শিগগির আসবে এবং এখন সংযুক্ত নয়।",
  "Job payment records": "কাজের পেমেন্ট রেকর্ড",
  "Job payments are kept separate from subscription payments":
    "কাজের পেমেন্ট সাবস্ক্রিপশন পেমেন্ট থেকে আলাদা রাখা হয়",
  Payer: "প্রদানকারী",
  Amount: "পরিমাণ",
  Method: "পদ্ধতি",
  Updated: "হালনাগাদ",
  "Cash recorded": "নগদ পেমেন্ট রেকর্ড",
  "Accept an application or create a booking request":
    "আবেদন গ্রহণ করুন বা বুকিং অনুরোধ তৈরি করুন",
  "Create and publish a job": "কাজ তৈরি ও প্রকাশ করুন",
  "Start a new job conversation": "কাজ নিয়ে নতুন কথোপকথন শুরু করুন",
  "View suggested workers for a job": "কাজের জন্য প্রস্তাবিত কর্মী দেখুন",
  "Payment recorded": "পেমেন্ট রেকর্ড করা হয়েছে",
  "Payment released": "পেমেন্ট ছাড়া হয়েছে",
  Held: "ধরে রাখা হয়েছে",
  Released: "ছাড়া হয়েছে",
  Refunded: "ফেরত দেওয়া হয়েছে",
  "Partially refunded": "আংশিক ফেরত দেওয়া হয়েছে",
  Failed: "ব্যর্থ",
  Paid: "পরিশোধিত",
  "Pending confirmation": "নিশ্চিতকরণের অপেক্ষায়",
  "Cash on completion": "কাজ শেষে নগদ",
  "Mobile financial service": "মোবাইল আর্থিক সেবা",
  Card: "কার্ড",
  "Bank transfer": "ব্যাংক ট্রান্সফার",
  Verified: "যাচাইকৃত",
  "Manual admin": "প্রশাসকের ম্যানুয়াল যাচাই",
  None: "কোনোটিই নয়",
  Phone: "ফোন",
  Identity: "পরিচয়",
  Skill: "দক্ষতা",
  "Super admin": "প্রধান প্রশাসক",
  "Operations admin": "পরিচালনা প্রশাসক",
  "Support admin": "সহায়তা প্রশাসক",
  "Safety admin": "নিরাপত্তা প্রশাসক",
  "Operator billing": "অপারেটর বিলিং",
  Unsupported: "অসমর্থিত",
  Unavailable: "পাওয়া যায়নি",
};

export function setActiveAdminLocale(locale: AdminLocale) {
  activeLocale = locale;
}

export function getActiveAdminLocale(): AdminLocale {
  return activeLocale;
}

export function tr(value: string): string {
  if (activeLocale !== "bn" || value.length === 0) return value;
  const exact = reviewedBangla[value] ?? generatedAdminBangla[value];
  if (exact) return exact;

  const patterns: Array<[RegExp, string]> = [
    [/^Confirm (.+)$/u, "নিশ্চিত করুন: $1"],
    [/^Decide risk item for (.+)$/u, "$1-এর ঝুঁকি সিদ্ধান্ত নিন"],
    [/^Force transition: (.+)$/u, "অবস্থা জোর করে বদলান: $1"],
    [/^Resolve dispute: (.+)$/u, "বিরোধ নিষ্পত্তি করুন: $1"],
    [/^Review report: (.+)$/u, "রিপোর্ট পর্যালোচনা করুন: $1"],
    [/^(.+) (.+) verification$/u, "$1 · $2 যাচাইকরণ"],
    [/^(.+) moderation step$/u, "$1 নিয়ন্ত্রণ ধাপ"],
    [/^(\d+) recipients match this segment$/u, "এই গ্রুপে $1 জন প্রাপক আছেন"],
  ];
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(value)) return value.replace(pattern, replacement);
  }
  return value;
}

export function localizedEntityName(nameEn: string, nameBn?: string | null) {
  return activeLocale === "bn" && nameBn?.trim() ? nameBn : nameEn;
}

export function friendlyAdminError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (activeLocale !== "bn") return message;
  if (/unauthor|session|sign.?in/iu.test(message)) {
    return "সেশনের সময় শেষ হয়েছে। আবার নিরাপদভাবে সাইন ইন করুন।";
  }
  if (/network|fetch|connect/iu.test(message)) {
    return "সার্ভারে সংযোগ করা যাচ্ছে না। সংযোগ দেখে আবার চেষ্টা করুন।";
  }
  if (/forbidden|permission/iu.test(message)) {
    return "এই কাজটি করার অনুমতি আপনার নেই।";
  }
  return "কাজটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।";
}

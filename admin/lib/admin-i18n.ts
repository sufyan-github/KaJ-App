import { generatedAdminBangla } from "./generated-admin-translations";

export type AdminLocale = "bn" | "en";

let activeLocale: AdminLocale = "en";

const reviewedBangla: Record<string, string> = {
  Active: "সক্রিয়",
  Actioned: "ব্যবস্থা নেওয়া হয়েছে",
  Admin: "প্রশাসক",
  Applications: "আবেদন",
  Approved: "অনুমোদিত",
  "Audit trail": "অডিট ইতিহাস",
  "Campaign dry-runs": "ক্যাম্পেইন যাচাই",
  Categories: "কাজের ধরন",
  Cancelled: "বাতিল",
  "Cancelled by customer": "গ্রাহক বাতিল করেছেন",
  "Cancelled by worker": "কর্মী বাতিল করেছেন",
  Cleared: "ঝুঁকিমুক্ত",
  Completed: "সম্পন্ন",
  Customer: "গ্রাহক",
  Configuration: "কনফিগারেশন",
  Dashboard: "ড্যাশবোর্ড",
  Disputes: "বিরোধ",
  Dismissed: "খারিজ",
  Draft: "খসড়া",
  "Document review queue": "নথি পর্যালোচনার তালিকা",
  "Evidence and resolution": "প্রমাণ ও সমাধান",
  "Feature flags": "ফিচার নিয়ন্ত্রণ",
  "Human review and progressive action": "মানব পর্যালোচনা ও ধাপে ব্যবস্থা",
  Jobs: "কাজ",
  "Launch service areas": "সেবার এলাকা চালু করুন",
  "Lifecycle rescue": "আটকে থাকা কাজ সচল করুন",
  "Live marketplace health": "মার্কেটপ্লেসের বর্তমান অবস্থা",
  Locations: "এলাকা",
  Notifications: "নোটিফিকেশন",
  Open: "খোলা",
  Pending: "অপেক্ষমাণ",
  "Percentage rollouts": "শতকরা হারে চালু করুন",
  "Preview and revert": "আগে দেখুন ও ফিরিয়ে নিন",
  Published: "প্রকাশিত",
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

import 'package:flutter/widgets.dart';

import 'generated_translation_catalog.dart';

abstract final class KaajLocalizations {
  static bool isEnglish(BuildContext context) =>
      Localizations.localeOf(context).languageCode == 'en';

  static String text(BuildContext context, String value) =>
      forLanguage(Localizations.localeOf(context).languageCode, value);

  static String forLanguage(String languageCode, String value) {
    if (value.isEmpty) return value;
    if (languageCode != 'en') return _reviewedBangla[value] ?? value;
    final translated =
        _reviewedEnglish[value] ?? generatedEnglishTranslations[value];
    if (translated != null) return _latinDigits(translated);
    final dynamicTranslation = _dynamicEnglish(value);
    return dynamicTranslation == value
        ? value
        : _latinDigits(dynamicTranslation);
  }

  static String _dynamicEnglish(String value) {
    if (!_isDynamicSystemCopy(value)) return value;
    var result = value;
    const replacements = <String, String>{
      'কেন প্রত্যাখ্যাত:': 'Why it was rejected:',
      'নথি পরিষ্কার করে আবার জমা দিন।':
          'Use a clear document and submit it again.',
      'লোকেশন যথেষ্ট নির্ভুল নয় (': 'Location accuracy is too low (',
      ')। খোলা জায়গায় গিয়ে আবার চেষ্টা করুন।':
          '). Move to an open area and try again.',
      'অনুমোদিত দূরত্ব ': 'Allowed distance ',
      ' · চেক-ইন ': ' · checked in ',
      ' দূরে': ' away',
      'টি কাজের নমুনা': ' work samples',
      'টি অপঠিত আপডেট আছে': ' unread updates',
      'টি অপঠিত আপডেট': ' unread updates',
      'টি উপধরন': ' subtypes',
      'টি কাজ': ' jobs',
      ' দিন আগে': ' days ago',
      ' ঘণ্টা আগে': ' hours ago',
      ' মিনিট আগে': ' minutes ago',
      ' দিন ': ' days ',
      ' ঘণ্টা ': ' hours ',
      ' ঘণ্টা বাকি': ' hours remaining',
      ' কাজের ছবি': ' work photo',
      ' বিভাগের সব পোস্ট': ' · all posts',
      '-এর সব কাজ দেখুন': ' · view all jobs',
      'আপনার রেটিং:': 'Your rating:',
      'কর্মী ': 'Worker ',
      'সার্ভার নির্ধারিত কাজের সময়:': 'Server-recorded work time:',
      'কাজের সময়:': 'Work time:',
      'পোস্টের সময়:': 'Posted time:',
      'কোনো বার্তা নেই': 'No message',
      'চলমান সময় ': 'Elapsed time ',
      'শেষ ': 'Ends ',
      'চুক্তি ': 'contract ',
      ' মিটার': ' metres',
      'ধাপ ': 'Step ',
      ' / ৫': ' / 5',
      ' কাজ': ' jobs',
      'রেটিং': 'Rating',
      'যাচাই': ' verification',
      'ফেরত:': 'Refund:',
      'ফি:': 'Fee:',
      'মেয়াদ শেষ:': 'Expires:',
      'সাবস্ক্রিপশন পেমেন্ট:': 'Subscription payment:',
      'তৈরি হয়েছে:': 'Created:',
      'পেমেন্ট রেকর্ড:': 'Payment recorded:',
      ' দিনের জন্য': ' days',
      'মিনিট': 'minutes',
      'জানুয়ারি': 'January',
      'ফেব্রুয়ারি': 'February',
      'মার্চ': 'March',
      'এপ্রিল': 'April',
      'মে': 'May',
      'জুন': 'June',
      'জুলাই': 'July',
      'আগস্ট': 'August',
      'সেপ্টেম্বর': 'September',
      'অক্টোবর': 'October',
      'নভেম্বর': 'November',
      'ডিসেম্বর': 'December',
    };
    for (final entry in replacements.entries) {
      result = result.replaceAll(entry.key, entry.value);
    }
    return result;
  }

  static bool _isDynamicSystemCopy(String value) {
    const prefixes = <String>[
      'কেন প্রত্যাখ্যাত:',
      'লোকেশন যথেষ্ট নির্ভুল নয়',
      'অনুমোদিত দূরত্ব ',
      'আপনার রেটিং:',
      'কর্মী ',
      'পোস্টের সময়:',
      'কাজের সময়:',
      'চলমান সময় ',
      'সার্ভার নির্ধারিত কাজের সময়:',
      'শেষ ',
      'ধাপ ',
    ];
    const fragments = <String>[
      'টি কাজের নমুনা',
      'টি অপঠিত আপডেট',
      'টি উপধরন',
      'টি কাজ · রেটিং ',
      ' দিনের ',
      ' ঘণ্টা বাকি',
      ' বিভাগের সব পোস্ট',
      '-এর সব কাজ দেখুন',
      ' কাজের ছবি',
      ' দিন আগে',
      ' ঘণ্টা আগে',
      ' মিনিট আগে',
      ' দিনের জন্য',
    ];
    return prefixes.any(value.startsWith) ||
        fragments.any(value.contains) ||
        value.startsWith('ফেরত:') ||
        value.startsWith('ফি:') ||
        value.startsWith('মেয়াদ শেষ:') ||
        value.startsWith('সাবস্ক্রিপশন পেমেন্ট:') ||
        value.startsWith('তৈরি হয়েছে:') ||
        value.startsWith('পেমেন্ট রেকর্ড:');
  }

  static String _latinDigits(String value) => value.replaceAllMapped(
    RegExp('[০-৯]'),
    (match) => '০১২৩৪৫৬৭৮৯'.indexOf(match.group(0)!).toString(),
  );
}

const _reviewedBangla = <String, String>{
  'English': 'ইংরেজি',
  'This is difficult to undo. Type “Delete” below to confirm.':
      'এটি ফিরিয়ে নেওয়া কঠিন। নিশ্চিত করতে নিচে “মুছুন” লিখুন।',
};

const _reviewedEnglish = <String, String>{
  'আজ': 'Today',
  'বর্তমান কাজের মোড': 'Current role',
  'মোড বদলালে হোমের কাজ ও সুবিধা সঙ্গে সঙ্গে বদলে যাবে।':
      'Choose whether you want to find work or post a job.',
  'সহায়তা': 'Help',
  'পরিচয় ও দক্ষতা যাচাই': 'Identity and skill verification',
  'তথ্য ও অ্যাকাউন্ট': 'Account and data',
  'এটি আপনার অ্যাকাউন্টের সাধারণ সময়। পোস্ট করা প্রতিটি কাজের তারিখ ও সময় আলাদা থাকবে।':
      'Set your usual weekly availability. Each job still has its own date and time.',
  'বর্তমানে সংরক্ষিত': 'Saved time slots',
  'দিন ও সময় যোগ/বদল করুন': 'Add or update days and times',
  'শুরুর সময়': 'Start time',
  'শেষের সময়': 'End time',
  'সকাল ৮টা–১২টা': '8 AM–12 PM',
  'দুপুর ১২টা–৫টা': '12–5 PM',
  'সন্ধ্যা ৬টা–১০টা': '6–10 PM',
  'রবি–বৃহস্পতি': 'Sunday–Thursday',
  'সাপ্তাহিক ছুটি': 'Weekend',
  'নির্বাচিত দিনের সময় যোগ/বদল করুন': 'Add or update selected time slots',
  'সব সময় সংরক্ষণ করুন': 'Save availability',
  'রবি': 'Sun',
  'সোম': 'Mon',
  'মঙ্গল': 'Tue',
  'বুধ': 'Wed',
  'বৃহস্পতি': 'Thu',
  'শুক্র': 'Fri',
  'শনি': 'Sat',
  'আবশ্যিক': 'Required',
  'আবার চেষ্টা করুন': 'Try again',
  'আবার তুলুন': 'Retake',
  'আবার যাচাই করুন': 'Verify again',
  'আবেদন': 'Apply',
  'আবেদনসমূহ': 'Applications',
  'আবেদন পাঠান': 'Submit application',
  'আমার বিরোধসমূহ': 'My disputes',
  'আমার পাওয়া রিভিউ': 'Reviews received',
  'আমার পোস্ট': 'My job posts',
  'আমার পোস্ট করা কাজ': 'My job posts',
  'অন্যান্য': 'Other',
  'আমার সময়ে মেলে': 'Match my time',
  'গতকাল': 'Yesterday',
  'সব': 'All',
  'অ্যাকাউন্ট': 'Account',
  'অ্যাকাউন্ট ও নিরাপত্তা': 'Account and security',
  'আপনার এলাকার কাজ': 'Jobs near you',
  'আপনার এলাকার কর্মী': 'Workers near you',
  'দক্ষতা ও খালি সময় মিলিয়ে কাছের কাজ দেখুন':
      'Browse nearby jobs that match your skills and availability',
  'দক্ষতা, যাচাই ও খালি সময় দেখে কর্মী বাছুন':
      'Compare skills, verification and availability',
  'এখন বাদ দিন': 'Skip for now',
  'এগিয়ে যান': 'Continue',
  'এড়িয়ে যান': 'Skip',
  'ঐচ্ছিক': 'Optional',
  'কর্মী': 'Worker',
  'কর্মী ও সময় খুঁজুন': 'Find workers and available times',
  'কর্মী খুঁজুন': 'Find workers',
  'কাছের কাজ খুঁজুন': 'Find jobs near you',
  'কাজ': 'Job',
  'কাজ করব': 'Find work',
  'কাজ খুঁজব': 'Find work',
  'কাজ খুঁজুন': 'Find jobs',
  'কাজ দেব': 'Post work',
  'কাজ পোস্ট করুন': 'Post a job',
  'কাজের আলোচনা': 'Job conversation',
  'কাজের অগ্রগতি': 'Work progress',
  'কাজের উপধরন': 'Work subtype',
  'কাজের দিন': 'Work date',
  'কাজের ধরন': 'Work types',
  'কাজের বিস্তারিত': 'Job details',
  'কাজের মালিক': 'Client',
  'কাজের সময়': 'Availability',
  'কাজের সময়:': 'Work time:',
  'কাজের পোর্টফোলিও': 'Work portfolio',
  'খালি কাজ ও সময় দেখুন': 'Browse open jobs and available times',
  'সময়সহ নতুন কাজ দিন': 'Add the date, time and pay',
  'খালি সময় দেখে বুক করুন': 'Check availability and book',
  'সংরক্ষিত কর্মী আবার বুক করুন': 'Book a saved worker again',
  'আবেদন দেখুন ও কর্মী বাছুন': 'Review applicants and choose a worker',
  'অনুরোধ নিশ্চিত ও অনুসরণ করুন': 'Confirm requests and track work',
  'সেবা ও দক্ষতা দেখুন': 'Browse services and skills',
  'আবেদন ও বুকিং আপডেট দেখুন': 'See application and booking updates',
  'কাজের আলোচনা নিরাপদে করুন': 'Keep job conversations in KAAJ',
  'আপনার পাওয়া মতামত দেখুন': 'See feedback from completed work',
  'পরিচয় ও দক্ষতা যাচাই করুন': 'Verify your identity and skills',
  'প্রমাণ ও সিদ্ধান্ত অনুসরণ করুন': 'Track evidence and decisions',
  'আপনার প্রোফাইল দেখুন': 'Preview what clients see',
  'দক্ষতা ও পারিশ্রমিক বদলান': 'Update skills and hourly rate',
  'দিন ও খালি সময় ঠিক করুন': 'Set your days and time slots',
  'আপনার কাজের নমুনা দেখান': 'Show examples of your work',
  'ক্যাপশন নেই': 'No caption',
  'খসড়া': 'Draft',
  'গৃহীত': 'Accepted',
  'গ্রহণ': 'Accept',
  'জমা দিন': 'Submit',
  'ঠিক আছে': 'OK',
  'ডিফল্ট কাজের সময়': 'Default availability',
  'দক্ষতা': 'Skills',
  'দ্রুত কাজ': 'Quick actions',
  'নিরাপত্তা রিপোর্ট': 'Safety report',
  'নিশ্চিত করুন': 'Confirm',
  'নতুন': 'New',
  'নোটিফিকেশন': 'Notifications',
  'সব পড়েছি': 'Mark all as read',
  'পছন্দ': 'Preferences',
  'পছন্দের কর্মী': 'Saved workers',
  'পরবর্তী': 'Next',
  'পরিচয়': 'Identity',
  'পবলিক প্রোফাইল': 'Public profile',
  'পাঠান': 'Send',
  'পাশে পান': 'Nearby',
  'পোর্টফোলিও': 'Portfolio',
  'প্রকাশ করুন': 'Publish',
  'প্রত্যাখ্যাত': 'Rejected',
  'প্রমাণ': 'Evidence',
  'ফিরুন': 'Back',
  'বাতিল': 'Cancel',
  'বাতিল করুন': 'Cancel',
  'বার্তা': 'Messages',
  'বাংলা': 'Bangla',
  'বাংলায় বদলান': 'Switch to Bangla',
  'বিরোধ': 'Disputes',
  'বিরোধ ও সিদ্ধান্ত': 'Disputes and decisions',
  'ব্যক্তিগত তথ্য সুরক্ষিত': 'Personal information is protected',
  'ব্যবহারকারীকে ব্লক করুন': 'Block user',
  'ভাষা': 'Language',
  'বর্তমান ভাষা': 'Current language',
  'ইংরেজিতে বদলান': 'Switch to English',
  'মুছুন': 'Delete',
  'ম্যাচ করা কর্মী': 'Matched workers',
  'যাচাইকরণ': 'Verification',
  'যাচাইকরণ কেন্দ্র': 'Verification centre',
  'রিভিউ': 'Reviews',
  'সাইন আউট': 'Sign out',
  'সাহায্য ও নিরাপত্তা': 'Help and safety',
  'সেটিংস': 'Settings',
  'প্রস্তাবিত টাকা': 'Proposed amount (BDT)',
  'বার্তা (ঐচ্ছিক)': 'Message (optional)',
  'সনাক্তকরণ': 'Verification',
  'সব সময়': 'All times',
  'সাবস্ক্রিপশন ও পেমেন্ট': 'Subscription and payments',
  'সাবস্ক্রিপশন': 'Subscription',
  'প্ল্যান, অপারেটর যাচাই ও সুবিধার অবস্থা দেখুন':
      'View plans, operator verification and access status',
  'কাজের পেমেন্ট ইতিহাস': 'Job payment history',
  'নগদ পেমেন্টের অপেক্ষমাণ ও সম্পন্ন রেকর্ড দেখুন':
      'View pending and completed cash payment records',
  'বর্তমান সাবস্ক্রিপশন': 'Current subscription',
  'সক্রিয়': 'Active',
  'নিষ্ক্রিয়': 'Inactive',
  'অপেক্ষমাণ': 'Pending',
  'পরিশোধিত': 'Paid',
  'মেয়াদ শেষ': 'Expired',
  'ব্যর্থ': 'Failed',
  'সাবস্ক্রিপশন এখন পরীক্ষামূলক পর্যায়ে আছে। বর্তমান কাজের সুবিধাগুলো বন্ধ করা হয়নি।':
      'Subscriptions are in pilot mode. Your current marketplace access remains available.',
  'অপারেটর সংযোগ': 'Operator connection',
  'সমর্থিত অপারেটর পাওয়া যায়নি': 'No supported operator detected',
  'অপারেটর যাচাই সম্পন্ন': 'Operator verified',
  'অপারেটর যাচাই অপেক্ষমাণ': 'Operator verification pending',
  'প্ল্যানসমূহ': 'Plans',
  'মূল্য, মেয়াদ ও সুবিধা দেখে আপনার জন্য উপযুক্ত প্ল্যান বাছুন।':
      'Compare price, duration and benefits to choose a plan.',
  'এখন কোনো প্ল্যান চালু নেই': 'No plans are active yet',
  'অ্যাডমিন প্ল্যান ও অপারেটর বিলিং প্রস্তুত করলে এখানে দেখা যাবে।':
      'Plans will appear here after admin configuration and operator billing readiness.',
  'প্ল্যানের অনুরোধ পাঠান': 'Request this plan',
  'সাবস্ক্রিপশন বাতিল করুন': 'Cancel subscription',
  'সাবস্ক্রিপশন অনুরোধ পাঠাবেন?': 'Send subscription request?',
  'অনুরোধ নিশ্চিত করার আগে মূল্য ও মেয়াদ দেখুন। অপারেটর নিবন্ধন নিশ্চিত হলে অনুমোদিত নিয়মে মোবাইল ব্যালেন্স থেকে চার্জ কাটা হতে পারে।':
      'Review the price and duration before confirming. Once operator registration is confirmed, the approved charge may be deducted from your mobile balance.',
  'অনুরোধ পাঠান': 'Send request',
  'সাবস্ক্রিপশন অনুরোধ অপেক্ষমাণ আছে।': 'Your subscription request is pending.',
  'সাবস্ক্রিপশন সক্রিয় হয়েছে।': 'Subscription activated.',
  'KAAJ থেকে অপারেটর বিলিং বন্ধ করা যায় না। অপারেটরের নিশ্চিতকরণ SMS-এ দেওয়া বন্ধ করার নিয়ম অনুসরণ করুন, তারপর এই পেজ রিফ্রেশ করুন।':
      'Carrier billing cannot be stopped inside KAAJ. Follow the unsubscribe instructions in your operator confirmation SMS, then refresh this page.',
  'অপারেটরের সর্বশেষ অবস্থা এখন যাচাই করা যায়নি। আগের নিরাপদ অবস্থা দেখানো হচ্ছে; কিছুক্ষণ পর আবার রিফ্রেশ করুন।':
      'The latest operator status could not be checked. The last safe state is shown; refresh again shortly.',
  'এই মুহূর্তে কোনো সমর্থিত অপারেটর নেই।':
      'No supported operator is available right now.',
  'মোবাইল অপারেটর বাছুন': 'Choose mobile operator',
  'নম্বরের প্রিফিক্স শুধু সম্ভাব্য অপারেটর বোঝায়; এটি যাচাই নয়।':
      'A number prefix is only an operator hint; it is not verification.',
  'সাবস্ক্রিপশন বাতিল হয়েছে।': 'Subscription cancelled.',
  'শিগগির আসছে': 'Coming soon',
  'অনলাইন পেমেন্ট, মোবাইল ব্যাংকিং ও কর্মীর টাকা উত্তোলন এখনো চালু নয়।':
      'Online payments, mobile banking and worker withdrawals are not enabled yet.',
  'এই সংস্করণে কাজের টাকা সরাসরি নগদে দিন। কাজের মালিক “পেমেন্ট হয়েছে” নিশ্চিত করলে KAAJ শুধু রেকর্ড রাখে; KAAJ টাকা গ্রহণ বা কমিশন কাটে না।':
      'In this version, pay for jobs directly in cash. KAAJ only records the owner’s confirmation; KAAJ does not collect money or charge commission.',
  'এখনো কোনো পেমেন্ট রেকর্ড নেই': 'No payment records yet',
  'কাজ সম্পন্ন হলে নগদ পেমেন্টের অবস্থা এখানে দেখা যাবে।':
      'Cash payment status will appear here after work is completed.',
  'নগদ পেমেন্ট হয়েছে': 'Cash payment recorded',
  'বিরোধ চলছে': 'Disputed',
  'পেমেন্ট অপেক্ষমাণ': 'Payment pending',
  'কর্মীকে পেমেন্ট': 'Payment to worker',
  'কাজের পেমেন্ট': 'Job payment',
  'পেমেন্ট নিয়ে বিরোধ চলছে': 'Payment is disputed',
  'নগদ পেমেন্ট অপেক্ষমাণ': 'Cash payment pending',
  'টাকা সরাসরি নগদে লেনদেন হবে। KAAJ শুধু উভয় পক্ষের কাজের রেকর্ড সংরক্ষণ করে।':
      'Cash is exchanged directly. KAAJ only keeps the work record for both parties.',
  'পেমেন্ট হয়েছে বলে চিহ্নিত করুন': 'Mark payment done',
  'নগদ পেমেন্ট হয়েছে?': 'Was the cash payment made?',
  'কর্মীকে সরাসরি পুরো টাকা দেওয়ার পর নিশ্চিত করুন। KAAJ টাকা গ্রহণ করবে না এবং কোনো কমিশন কাটবে না।':
      'Confirm only after paying the worker directly in full. KAAJ does not collect money or deduct commission.',
  'পেমেন্ট হয়েছে': 'Payment done',
  'নগদ পেমেন্ট রেকর্ড হয়েছে।': 'Cash payment recorded.',
  'পেমেন্ট এখন রেকর্ড করা যায়নি।':
      'The payment could not be recorded right now.',
  'নগদ পেমেন্ট রেকর্ড হয়েছে': 'Cash payment recorded',
  'অনুরোধটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।':
      'The request could not be completed. Please try again.',
};

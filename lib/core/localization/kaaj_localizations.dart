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
    ];
    return prefixes.any(value.startsWith) ||
        fragments.any(value.contains) ||
        value.startsWith('ফেরত:') ||
        value.startsWith('ফি:');
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
};

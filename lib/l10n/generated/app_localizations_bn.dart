// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Bengali Bangla (`bn`).
class AppLocalizationsBn extends AppLocalizations {
  AppLocalizationsBn([String locale = 'bn']) : super(locale);

  @override
  String get appName => 'কাজ';

  @override
  String get appTagline => 'স্থানীয় কাজ। বিশ্বস্ত মানুষ।';

  @override
  String get appStarting => 'কাজ চালু হচ্ছে';

  @override
  String get backToPhone => 'ফোন নম্বরে ফিরে যান';

  @override
  String codeExpiresInMinutes(int minutes) {
    return 'কোডটি $minutes মিনিটে শেষ হবে।';
  }

  @override
  String get offlineBanner => 'আপনি অফলাইনে আছেন। কিছু তথ্য পুরোনো হতে পারে।';

  @override
  String get continueLabel => 'এগিয়ে যান';

  @override
  String get phoneTitle => 'আপনার ফোন নম্বর দিন';

  @override
  String get phoneSubtitle => 'আমরা ৬ সংখ্যার একটি যাচাই কোড পাঠাব।';

  @override
  String get phoneLabel => 'মোবাইল নম্বর';

  @override
  String get phoneHint => '০১XXXXXXXXX';

  @override
  String get phoneConsent => 'আমি সেবার শর্ত ও গোপনীয়তা নীতিতে সম্মত।';

  @override
  String get sendCode => 'যাচাই কোড পাঠান';

  @override
  String get otpTitle => 'নম্বর যাচাই করুন';

  @override
  String otpSubtitle(String phone) {
    return '$phone নম্বরে পাঠানো ৬ সংখ্যার কোডটি লিখুন।';
  }

  @override
  String get otpLabel => 'যাচাই কোড';

  @override
  String get verifyCode => 'যাচাই করে এগিয়ে যান';

  @override
  String get resendCode => 'নতুন কোড পাঠান';

  @override
  String resendInSeconds(int seconds) {
    return '$seconds সেকেন্ড পরে নতুন কোড পাঠান';
  }

  @override
  String get codeExpired => 'এই কোডের সময় শেষ হয়েছে। নতুন কোড নিন।';

  @override
  String get welcomeTitle => 'কাজ-এ স্বাগতম';

  @override
  String get welcomeBody =>
      'আপনার নিরাপদ অ্যাকাউন্ট প্রস্তুত। কাছের কাজ ও বিশ্বস্ত মানুষ খুঁজুন।';

  @override
  String get signOut => 'সাইন আউট';

  @override
  String get tryAgain => 'আবার চেষ্টা করুন';

  @override
  String requestReference(String requestId) {
    return 'রেফারেন্স: $requestId';
  }

  @override
  String get offlineMessage =>
      'ইন্টারনেট সংযোগ নেই। সংযোগ দেখে আবার চেষ্টা করুন।';

  @override
  String get timeoutMessage => 'অনুরোধটি বেশি সময় নিচ্ছে। আবার চেষ্টা করুন।';

  @override
  String get unexpectedMessage =>
      'অনুরোধটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন বা সহায়তা নিন।';

  @override
  String get validationMessage => 'দেওয়া তথ্য যাচাই করে আবার চেষ্টা করুন।';

  @override
  String get unauthorizedMessage =>
      'আপনার সেশনের সময় শেষ হয়েছে। আবার সাইন ইন করুন।';

  @override
  String get forbiddenMessage => 'এই কাজটি করার অনুমতি আপনার নেই।';

  @override
  String get notFoundMessage => 'অনুরোধ করা তথ্যটি পাওয়া যায়নি।';

  @override
  String get conflictMessage =>
      'তথ্যটি পরিবর্তিত হয়েছে। হালনাগাদ করে আবার চেষ্টা করুন।';

  @override
  String get rateLimitedMessage =>
      'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।';

  @override
  String get otpIncorrectMessage => 'যাচাই কোডটি সঠিক নয়।';

  @override
  String get otpAttemptsExceededMessage =>
      'অনেকবার ভুল কোড দেওয়া হয়েছে। নতুন কোড নিন।';

  @override
  String get otpAlreadyUsedMessage =>
      'এই যাচাই কোডটি আগে ব্যবহার করা হয়েছে। নতুন কোড নিন।';

  @override
  String get otpNotFoundMessage =>
      'এই যাচাই অনুরোধটি পাওয়া যায়নি। নতুন কোড নিন।';

  @override
  String get invalidPhone => 'সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।';

  @override
  String get invalidOtp => 'সম্পূর্ণ ৬ সংখ্যার যাচাই কোড লিখুন।';

  @override
  String get acceptTerms => 'এগোতে সেবার শর্ত ও গোপনীয়তা নীতিতে সম্মতি দিন।';
}

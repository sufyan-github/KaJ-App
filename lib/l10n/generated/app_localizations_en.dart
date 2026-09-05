// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'KAAJ';

  @override
  String get appTagline => 'Local work. Trusted people.';

  @override
  String get appStarting => 'KAAJ is starting';

  @override
  String get backToPhone => 'Back to phone number';

  @override
  String codeExpiresInMinutes(int minutes) {
    return 'The code expires in $minutes minutes.';
  }

  @override
  String get offlineBanner =>
      'You are offline. Some information may be out of date.';

  @override
  String get continueLabel => 'Continue';

  @override
  String get phoneTitle => 'Enter your phone number';

  @override
  String get phoneSubtitle =>
      'Use a Robi (018) or Airtel (016) number. We will send a 6-digit verification code.';

  @override
  String get phoneLabel => 'Mobile number';

  @override
  String get phoneHint => '01XXXXXXXXX';

  @override
  String get phoneConsent =>
      'I agree to the Terms of Service and Privacy Policy.';

  @override
  String get phoneSafety => 'Your phone number will remain secure.';

  @override
  String get sendCode => 'Send verification code';

  @override
  String get otpTitle => 'Verify your number';

  @override
  String otpSubtitle(String phone) {
    return 'Enter the 6-digit code sent to $phone.';
  }

  @override
  String get otpLabel => 'Verification code';

  @override
  String get verifyCode => 'Verify and continue';

  @override
  String get resendCode => 'Send a new code';

  @override
  String resendInSeconds(int seconds) {
    return 'Send a new code in ${seconds}s';
  }

  @override
  String get codeExpired =>
      'This verification code has expired. Send a new code.';

  @override
  String get welcomeTitle => 'Welcome to KAAJ';

  @override
  String get welcomeBody =>
      'Your secure account is ready. Find nearby work and trusted people.';

  @override
  String get signOut => 'Sign out';

  @override
  String get tryAgain => 'Try again';

  @override
  String requestReference(String requestId) {
    return 'Reference: $requestId';
  }

  @override
  String get offlineMessage =>
      'No internet connection. Check your connection and try again.';

  @override
  String get timeoutMessage => 'The request took too long. Please try again.';

  @override
  String get unexpectedMessage =>
      'We could not complete that request. Please try again or contact support.';

  @override
  String get validationMessage =>
      'Check the information you entered and try again.';

  @override
  String get unauthorizedMessage =>
      'Your session is no longer valid. Sign in again.';

  @override
  String get forbiddenMessage => 'You do not have permission to do that.';

  @override
  String get notFoundMessage => 'The requested information could not be found.';

  @override
  String get conflictMessage =>
      'This information has changed. Refresh and try again.';

  @override
  String get rateLimitedMessage =>
      'Too many attempts. Wait a little and try again.';

  @override
  String get otpIncorrectMessage => 'The verification code is incorrect.';

  @override
  String get otpAttemptsExceededMessage =>
      'Too many incorrect attempts. Send a new code.';

  @override
  String get otpAlreadyUsedMessage =>
      'This verification code has already been used. Send a new code.';

  @override
  String get otpNotFoundMessage =>
      'This verification request was not found. Send a new code.';

  @override
  String get invalidPhone => 'Enter a valid Bangladeshi mobile number.';

  @override
  String get unsupportedOperatorPhone =>
      'Only Robi (018) and Airtel (016) numbers can register.';

  @override
  String get invalidOtp => 'Enter the complete 6-digit verification code.';

  @override
  String get acceptTerms =>
      'Accept the Terms of Service and Privacy Policy to continue.';
}

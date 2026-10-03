// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get passwordLoginTitle => 'Welcome back';

  @override
  String get passwordLoginSubtitle =>
      'Sign in with your mobile number and password. Login does not purchase or renew a subscription.';

  @override
  String get passwordLabel => 'Password';

  @override
  String get confirmPasswordLabel => 'Confirm password';

  @override
  String get passwordSignIn => 'Sign in';

  @override
  String get passwordShow => 'Show password';

  @override
  String get passwordHide => 'Hide password';

  @override
  String get passwordForgot => 'Forgot password?';

  @override
  String get passwordRegister => 'Register or set up access with OTP';

  @override
  String get passwordSetupTitle => 'Set your password';

  @override
  String get passwordSetupSubtitle =>
      'Use this password with your registered mobile number next time. Your subscription is unchanged.';

  @override
  String get passwordSave => 'Save password';

  @override
  String get passwordRules =>
      'Use at least 12 characters (maximum 72 UTF-8 bytes). Longer phrases are easier to remember; Bangla characters use more than one byte.';

  @override
  String get passwordMismatch => 'Passwords do not match.';

  @override
  String get passwordRequired => 'Enter your password.';

  @override
  String get passwordInvalidCredentials =>
      'The mobile number or password is incorrect.';

  @override
  String get passwordAlreadySet =>
      'A password is already set. Use password recovery to change it.';

  @override
  String get passwordSubscriptionRequired =>
      'Complete the existing subscription verification before setting a password.';

  @override
  String get passwordRecoveryTitle => 'Recover your password';

  @override
  String get passwordRecoveryConsent =>
      'I agree to use the existing bdApps subscription OTP for recovery. Verification may charge BDT 2.78 and activate daily renewal until I unsubscribe. This is not a free password-reset SMS.';

  @override
  String get passwordRecoverySent =>
      'If this number has an available account, a recovery code has been sent. Enter it below before it expires.';

  @override
  String get passwordRecoveryVerifyConsent =>
      'I understand that verifying this recovery code may activate the BDT 2.78/day subscription, renewing daily until I unsubscribe.';

  @override
  String get passwordReset => 'Verify and reset password';

  @override
  String get passwordResetSuccess =>
      'Your password has been reset and previous sessions revoked. Sign in with your new password.';

  @override
  String get passwordRequestAnother => 'Request another recovery code';

  @override
  String get passwordCheckAccess => 'Checking your account and subscription…';

  @override
  String get subscriptionInactiveLogin =>
      'Your subscription is inactive. Please subscribe to continue accessing the platform.';

  @override
  String get passwordBackToLogin => 'Back to sign in';

  @override
  String get passwordManage => 'Password and account access';

  @override
  String get passwordContinueSubscription => 'Open subscription';

  @override
  String get passwordRetry => 'Try again';

  @override
  String get passwordSignOut => 'Sign out';

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
  String get otpSubscriptionConsent =>
      'I agree to the KAAJ subscription at BDT 2.78 per day, charged to my mobile balance and renewed daily until I unsubscribe. Verifying this code activates the subscription.';

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

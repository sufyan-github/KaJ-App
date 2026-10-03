import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_bn.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('bn'),
    Locale('en'),
  ];

  /// No description provided for @passwordLoginTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome back'**
  String get passwordLoginTitle;

  /// No description provided for @passwordLoginSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in with your mobile number and password. Login does not purchase or renew a subscription.'**
  String get passwordLoginSubtitle;

  /// No description provided for @passwordLabel.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get passwordLabel;

  /// No description provided for @confirmPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'Confirm password'**
  String get confirmPasswordLabel;

  /// No description provided for @passwordSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get passwordSignIn;

  /// No description provided for @passwordShow.
  ///
  /// In en, this message translates to:
  /// **'Show password'**
  String get passwordShow;

  /// No description provided for @passwordHide.
  ///
  /// In en, this message translates to:
  /// **'Hide password'**
  String get passwordHide;

  /// No description provided for @passwordForgot.
  ///
  /// In en, this message translates to:
  /// **'Forgot password?'**
  String get passwordForgot;

  /// No description provided for @passwordRegister.
  ///
  /// In en, this message translates to:
  /// **'Register or set up access with OTP'**
  String get passwordRegister;

  /// No description provided for @passwordSetupTitle.
  ///
  /// In en, this message translates to:
  /// **'Set your password'**
  String get passwordSetupTitle;

  /// No description provided for @passwordSetupSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Use this password with your registered mobile number next time. Your subscription is unchanged.'**
  String get passwordSetupSubtitle;

  /// No description provided for @passwordSave.
  ///
  /// In en, this message translates to:
  /// **'Save password'**
  String get passwordSave;

  /// No description provided for @passwordRules.
  ///
  /// In en, this message translates to:
  /// **'Use at least 12 characters (maximum 72 UTF-8 bytes). Longer phrases are easier to remember; Bangla characters use more than one byte.'**
  String get passwordRules;

  /// No description provided for @passwordMismatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match.'**
  String get passwordMismatch;

  /// No description provided for @passwordRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter your password.'**
  String get passwordRequired;

  /// No description provided for @passwordInvalidCredentials.
  ///
  /// In en, this message translates to:
  /// **'The mobile number or password is incorrect.'**
  String get passwordInvalidCredentials;

  /// No description provided for @passwordAlreadySet.
  ///
  /// In en, this message translates to:
  /// **'A password is already set. Use password recovery to change it.'**
  String get passwordAlreadySet;

  /// No description provided for @passwordSubscriptionRequired.
  ///
  /// In en, this message translates to:
  /// **'Complete the existing subscription verification before setting a password.'**
  String get passwordSubscriptionRequired;

  /// No description provided for @passwordRecoveryTitle.
  ///
  /// In en, this message translates to:
  /// **'Recover your password'**
  String get passwordRecoveryTitle;

  /// No description provided for @passwordRecoveryConsent.
  ///
  /// In en, this message translates to:
  /// **'I agree to use the existing bdApps subscription OTP for recovery. Verification may charge BDT 2.78 and activate daily renewal until I unsubscribe. This is not a free password-reset SMS.'**
  String get passwordRecoveryConsent;

  /// No description provided for @passwordRecoverySent.
  ///
  /// In en, this message translates to:
  /// **'If this number has an available account, a recovery code has been sent. Enter it below before it expires.'**
  String get passwordRecoverySent;

  /// No description provided for @passwordRecoveryVerifyConsent.
  ///
  /// In en, this message translates to:
  /// **'I understand that verifying this recovery code may activate the BDT 2.78/day subscription, renewing daily until I unsubscribe.'**
  String get passwordRecoveryVerifyConsent;

  /// No description provided for @passwordReset.
  ///
  /// In en, this message translates to:
  /// **'Verify and reset password'**
  String get passwordReset;

  /// No description provided for @passwordResetSuccess.
  ///
  /// In en, this message translates to:
  /// **'Your password has been reset and previous sessions revoked. Sign in with your new password.'**
  String get passwordResetSuccess;

  /// No description provided for @passwordRequestAnother.
  ///
  /// In en, this message translates to:
  /// **'Request another recovery code'**
  String get passwordRequestAnother;

  /// No description provided for @passwordCheckAccess.
  ///
  /// In en, this message translates to:
  /// **'Checking your account and subscription…'**
  String get passwordCheckAccess;

  /// No description provided for @subscriptionInactiveLogin.
  ///
  /// In en, this message translates to:
  /// **'Your subscription is inactive. Please subscribe to continue accessing the platform.'**
  String get subscriptionInactiveLogin;

  /// No description provided for @passwordBackToLogin.
  ///
  /// In en, this message translates to:
  /// **'Back to sign in'**
  String get passwordBackToLogin;

  /// No description provided for @passwordManage.
  ///
  /// In en, this message translates to:
  /// **'Password and account access'**
  String get passwordManage;

  /// No description provided for @passwordContinueSubscription.
  ///
  /// In en, this message translates to:
  /// **'Open subscription'**
  String get passwordContinueSubscription;

  /// No description provided for @passwordRetry.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get passwordRetry;

  /// No description provided for @passwordSignOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get passwordSignOut;

  /// No description provided for @appName.
  ///
  /// In en, this message translates to:
  /// **'KAAJ'**
  String get appName;

  /// No description provided for @appTagline.
  ///
  /// In en, this message translates to:
  /// **'Local work. Trusted people.'**
  String get appTagline;

  /// No description provided for @appStarting.
  ///
  /// In en, this message translates to:
  /// **'KAAJ is starting'**
  String get appStarting;

  /// No description provided for @backToPhone.
  ///
  /// In en, this message translates to:
  /// **'Back to phone number'**
  String get backToPhone;

  /// No description provided for @codeExpiresInMinutes.
  ///
  /// In en, this message translates to:
  /// **'The code expires in {minutes} minutes.'**
  String codeExpiresInMinutes(int minutes);

  /// No description provided for @offlineBanner.
  ///
  /// In en, this message translates to:
  /// **'You are offline. Some information may be out of date.'**
  String get offlineBanner;

  /// No description provided for @continueLabel.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get continueLabel;

  /// No description provided for @phoneTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter your phone number'**
  String get phoneTitle;

  /// No description provided for @phoneSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Use a Robi (018) or Airtel (016) number. We will send a 6-digit verification code.'**
  String get phoneSubtitle;

  /// No description provided for @phoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Mobile number'**
  String get phoneLabel;

  /// No description provided for @phoneHint.
  ///
  /// In en, this message translates to:
  /// **'01XXXXXXXXX'**
  String get phoneHint;

  /// No description provided for @phoneConsent.
  ///
  /// In en, this message translates to:
  /// **'I agree to the Terms of Service and Privacy Policy.'**
  String get phoneConsent;

  /// No description provided for @phoneSafety.
  ///
  /// In en, this message translates to:
  /// **'Your phone number will remain secure.'**
  String get phoneSafety;

  /// No description provided for @sendCode.
  ///
  /// In en, this message translates to:
  /// **'Send verification code'**
  String get sendCode;

  /// No description provided for @otpTitle.
  ///
  /// In en, this message translates to:
  /// **'Verify your number'**
  String get otpTitle;

  /// No description provided for @otpSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code sent to {phone}.'**
  String otpSubtitle(String phone);

  /// No description provided for @otpLabel.
  ///
  /// In en, this message translates to:
  /// **'Verification code'**
  String get otpLabel;

  /// No description provided for @otpSubscriptionConsent.
  ///
  /// In en, this message translates to:
  /// **'I agree to the KAAJ subscription at BDT 2.78 per day, charged to my mobile balance and renewed daily until I unsubscribe. Verifying this code activates the subscription.'**
  String get otpSubscriptionConsent;

  /// No description provided for @verifyCode.
  ///
  /// In en, this message translates to:
  /// **'Verify and continue'**
  String get verifyCode;

  /// No description provided for @resendCode.
  ///
  /// In en, this message translates to:
  /// **'Send a new code'**
  String get resendCode;

  /// No description provided for @resendInSeconds.
  ///
  /// In en, this message translates to:
  /// **'Send a new code in {seconds}s'**
  String resendInSeconds(int seconds);

  /// No description provided for @codeExpired.
  ///
  /// In en, this message translates to:
  /// **'This verification code has expired. Send a new code.'**
  String get codeExpired;

  /// No description provided for @welcomeTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome to KAAJ'**
  String get welcomeTitle;

  /// No description provided for @welcomeBody.
  ///
  /// In en, this message translates to:
  /// **'Your secure account is ready. Find nearby work and trusted people.'**
  String get welcomeBody;

  /// No description provided for @signOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get signOut;

  /// No description provided for @tryAgain.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get tryAgain;

  /// No description provided for @requestReference.
  ///
  /// In en, this message translates to:
  /// **'Reference: {requestId}'**
  String requestReference(String requestId);

  /// No description provided for @offlineMessage.
  ///
  /// In en, this message translates to:
  /// **'No internet connection. Check your connection and try again.'**
  String get offlineMessage;

  /// No description provided for @timeoutMessage.
  ///
  /// In en, this message translates to:
  /// **'The request took too long. Please try again.'**
  String get timeoutMessage;

  /// No description provided for @unexpectedMessage.
  ///
  /// In en, this message translates to:
  /// **'We could not complete that request. Please try again or contact support.'**
  String get unexpectedMessage;

  /// No description provided for @validationMessage.
  ///
  /// In en, this message translates to:
  /// **'Check the information you entered and try again.'**
  String get validationMessage;

  /// No description provided for @unauthorizedMessage.
  ///
  /// In en, this message translates to:
  /// **'Your session is no longer valid. Sign in again.'**
  String get unauthorizedMessage;

  /// No description provided for @forbiddenMessage.
  ///
  /// In en, this message translates to:
  /// **'You do not have permission to do that.'**
  String get forbiddenMessage;

  /// No description provided for @notFoundMessage.
  ///
  /// In en, this message translates to:
  /// **'The requested information could not be found.'**
  String get notFoundMessage;

  /// No description provided for @conflictMessage.
  ///
  /// In en, this message translates to:
  /// **'This information has changed. Refresh and try again.'**
  String get conflictMessage;

  /// No description provided for @rateLimitedMessage.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Wait a little and try again.'**
  String get rateLimitedMessage;

  /// No description provided for @otpIncorrectMessage.
  ///
  /// In en, this message translates to:
  /// **'The verification code is incorrect.'**
  String get otpIncorrectMessage;

  /// No description provided for @otpAttemptsExceededMessage.
  ///
  /// In en, this message translates to:
  /// **'Too many incorrect attempts. Send a new code.'**
  String get otpAttemptsExceededMessage;

  /// No description provided for @otpAlreadyUsedMessage.
  ///
  /// In en, this message translates to:
  /// **'This verification code has already been used. Send a new code.'**
  String get otpAlreadyUsedMessage;

  /// No description provided for @otpNotFoundMessage.
  ///
  /// In en, this message translates to:
  /// **'This verification request was not found. Send a new code.'**
  String get otpNotFoundMessage;

  /// No description provided for @invalidPhone.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid Bangladeshi mobile number.'**
  String get invalidPhone;

  /// No description provided for @unsupportedOperatorPhone.
  ///
  /// In en, this message translates to:
  /// **'Only Robi (018) and Airtel (016) numbers can register.'**
  String get unsupportedOperatorPhone;

  /// No description provided for @invalidOtp.
  ///
  /// In en, this message translates to:
  /// **'Enter the complete 6-digit verification code.'**
  String get invalidOtp;

  /// No description provided for @acceptTerms.
  ///
  /// In en, this message translates to:
  /// **'Accept the Terms of Service and Privacy Policy to continue.'**
  String get acceptTerms;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['bn', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'bn':
      return AppLocalizationsBn();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}

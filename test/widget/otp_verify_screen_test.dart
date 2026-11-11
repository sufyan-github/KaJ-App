import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/features/auth/domain/entities/auth_result.dart';
import 'package:kaaj/features/auth/domain/entities/otp_challenge.dart';
import 'package:kaaj/features/auth/domain/repositories/auth_repository.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';
import 'package:kaaj/features/auth/presentation/screens/otp_verify_screen.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

void main() {
  for (final language in ['en', 'bn']) {
    testWidgets('requires explicit paid subscription consent in $language', (
      tester,
    ) async {
      final repository = _FakeAuthRepository();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [authRepositoryProvider.overrideWithValue(repository)],
          child: MaterialApp(
            locale: Locale(language),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            home: const OtpVerifyScreen(
              challenge: OtpChallenge(
                id: 'consent-test',
                phone: '+8801812345678',
                expiresInSeconds: 300,
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      final button = find.byType(ElevatedButton);
      expect(tester.widget<ElevatedButton>(button).onPressed, isNull);
      expect(
        tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
        isFalse,
      );
      expect(
        find.textContaining(
          language == 'en' ? 'BDT 2.78 per day' : 'দৈনিক ২.৭৮ টাকা',
        ),
        findsOneWidget,
      );
      await tester.enterText(find.byType(TextFormField), '123456');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();
      expect(
        repository.verifyCount,
        0,
        reason: 'Keyboard submission must not bypass consent',
      );
      await tester.ensureVisible(find.byType(CheckboxListTile));
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pump();
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pump();
      expect(repository.verifyCount, 1);
    });
  }
  const verifyErrors = {
    'OTP_INVALID': (
      'The verification code is incorrect.',
      'যাচাই কোডটি সঠিক নয়।',
    ),
    'AUTH_OTP_EXPIRED': (
      'This verification code has expired. Send a new code.',
      'এই কোডের সময় শেষ হয়েছে। নতুন কোড নিন।',
    ),
    'OTP_EXPIRED': (
      'This verification code has expired. Send a new code.',
      'এই কোডের সময় শেষ হয়েছে। নতুন কোড নিন।',
    ),
    'OTP_ATTEMPTS_EXCEEDED': (
      'Too many incorrect attempts. Send a new code.',
      'অনেকবার ভুল কোড দেওয়া হয়েছে। নতুন কোড নিন।',
    ),
  };
  for (final language in ['en', 'bn']) {
    for (final MapEntry(key: code, value: (english, bangla))
        in verifyErrors.entries) {
      testWidgets('shows localized $code copy in $language', (tester) async {
        final repository = _FakeAuthRepository(
          verifyFailure: Failure(
            kind: FailureKind.validation,
            code: code,
            message: 'Server English copy',
          ),
        );
        await _pumpOtp(tester, repository, language);
        await tester.enterText(find.byType(TextFormField), '123456');
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pump();
        await tester.ensureVisible(find.byType(CheckboxListTile));
        await tester.tap(find.byType(CheckboxListTile));
        await tester.pump();
        await tester.ensureVisible(find.byType(ElevatedButton));
        await tester.tap(find.byType(ElevatedButton));
        await tester.pump();
        await tester.pump();

        expect(repository.verifyCount, 1);
        expect(find.text(language == 'en' ? english : bangla), findsOneWidget);
        expect(find.text('Server English copy'), findsNothing);
        expect(
          find.textContaining(
            language == 'en' ? 'BDT 2.78 per day' : 'দৈনিক ২.৭৮ টাকা',
          ),
          findsOneWidget,
          reason: 'The subscription consent copy stays visible',
        );
      });
    }

    testWidgets('explains an unavailable OTP SMS route in $language', (
      tester,
    ) async {
      final repository = _FakeAuthRepository(
        requestFailure: const Failure(
          kind: FailureKind.server,
          code: 'OPERATOR_SMS_UNAVAILABLE',
          message: 'Server English copy',
        ),
      );
      await _pumpOtp(tester, repository, language);
      await tester.pump(const Duration(seconds: 30));
      final resend = find.byType(TextButton).last;
      await tester.ensureVisible(resend);
      await tester.tap(resend);
      await tester.pump();

      expect(repository.requestCount, 1);
      expect(
        find.text(
          language == 'en'
              ? 'We could not send the verification SMS right now. Wait a few minutes and try again.'
              : 'এই মুহূর্তে যাচাই কোডের SMS পাঠানো যায়নি। কয়েক মিনিট পরে আবার চেষ্টা করুন।',
        ),
        findsOneWidget,
      );
    });
  }

  testWidgets('resend requests and installs a replacement OTP challenge', (
    tester,
  ) async {
    final repository = _FakeAuthRepository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [authRepositoryProvider.overrideWithValue(repository)],
        child: const MaterialApp(
          locale: Locale('en'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          home: OtpVerifyScreen(
            challenge: OtpChallenge(
              id: 'first-challenge',
              phone: '+8801712345678',
              expiresInSeconds: 300,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Send a new code in 30s'), findsOneWidget);
    await tester.pump(const Duration(seconds: 30));
    expect(find.text('Send a new code'), findsOneWidget);

    await tester.ensureVisible(find.text('Send a new code'));
    await tester.tap(find.text('Send a new code'));
    await tester.pump();

    expect(repository.requestCount, 1);
    expect(find.text('Send a new code in 30s'), findsOneWidget);
  });
}

Future<void> _pumpOtp(
  WidgetTester tester,
  AuthRepository repository,
  String language,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [authRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp(
        locale: Locale(language),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: const OtpVerifyScreen(
          challenge: OtpChallenge(
            id: 'error-test',
            phone: '+8801812345678',
            expiresInSeconds: 3600,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

class _FakeAuthRepository implements AuthRepository {
  _FakeAuthRepository({this.verifyFailure, this.requestFailure});

  final Failure? requestFailure;
  final Failure? verifyFailure;
  int requestCount = 0;
  int verifyCount = 0;

  @override
  Future<void> logout() async {}

  @override
  Future<void> logoutAll() async {}

  @override
  Future<OtpChallenge> requestOtp(String phone) async {
    requestCount++;
    if (requestFailure case final failure?) throw failure;
    return OtpChallenge(
      id: 'replacement-challenge',
      phone: phone,
      expiresInSeconds: 300,
    );
  }

  @override
  Future<bool> restoreSession() async => false;

  @override
  Future<AuthResult> verifyOtp({
    required OtpChallenge challenge,
    required String code,
  }) async {
    verifyCount++;
    if (verifyFailure case final failure?) throw failure;
    throw const Failure(
      kind: FailureKind.network,
      message: 'Test connection unavailable',
    );
  }
}

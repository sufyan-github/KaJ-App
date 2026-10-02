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

class _FakeAuthRepository implements AuthRepository {
  int requestCount = 0;
  int verifyCount = 0;

  @override
  Future<void> logout() async {}

  @override
  Future<void> logoutAll() async {}

  @override
  Future<OtpChallenge> requestOtp(String phone) async {
    requestCount++;
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
    throw const Failure(
      kind: FailureKind.network,
      message: 'Test connection unavailable',
    );
  }
}

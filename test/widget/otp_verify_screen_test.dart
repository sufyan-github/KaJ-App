import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/auth/domain/entities/auth_result.dart';
import 'package:kaaj/features/auth/domain/entities/otp_challenge.dart';
import 'package:kaaj/features/auth/domain/repositories/auth_repository.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';
import 'package:kaaj/features/auth/presentation/screens/otp_verify_screen.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

void main() {
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

    await tester.tap(find.text('Send a new code'));
    await tester.pump();

    expect(repository.requestCount, 1);
    expect(find.text('Send a new code in 30s'), findsOneWidget);
  });
}

class _FakeAuthRepository implements AuthRepository {
  int requestCount = 0;

  @override
  Future<void> logout() async {}

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
  }) async => const AuthResult(isNewUser: false);
}

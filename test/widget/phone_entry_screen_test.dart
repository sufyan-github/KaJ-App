import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/auth/domain/entities/auth_result.dart';
import 'package:kaaj/features/auth/domain/entities/otp_challenge.dart';
import 'package:kaaj/features/auth/domain/repositories/auth_repository.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';
import 'package:kaaj/features/auth/presentation/screens/phone_entry_screen.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

void main() {
  testWidgets('phone entry remains usable at 200% text scale', (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 3;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(_FakeAuthRepository()),
        ],
        child: const MaterialApp(
          locale: Locale('en'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          home: PhoneEntryScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Enter your phone number'), findsOneWidget);
    expect(find.text('Send verification code'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('rejects unsupported operator before requesting an OTP', (
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
          home: PhoneEntryScreen(),
        ),
      ),
    );

    await tester.enterText(find.byType(TextFormField), '01712345678');
    await tester.tap(
      find.text('I agree to the Terms of Service and Privacy Policy.'),
    );
    await tester.tap(find.text('Send verification code'));
    await tester.pump();

    expect(
      find.text('Only Robi (018) and Airtel (016) numbers can register.'),
      findsOneWidget,
    );
    expect(repository.requestOtpCalls, 0);
  });
}

class _FakeAuthRepository implements AuthRepository {
  int requestOtpCalls = 0;

  @override
  Future<void> logout() async {}

  @override
  Future<void> logoutAll() async {}

  @override
  Future<OtpChallenge> requestOtp(String phone) async {
    requestOtpCalls += 1;
    return OtpChallenge(
      id: '5c24b335-3c2a-4f6f-a37a-237d6f5644d0',
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

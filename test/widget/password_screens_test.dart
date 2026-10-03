import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/routing/app_router.dart';
import 'package:kaaj/core/theme/app_theme.dart';
import 'package:kaaj/features/auth/data/repositories/password_repository.dart';
import 'package:kaaj/features/auth/domain/entities/otp_challenge.dart';
import 'package:kaaj/features/auth/domain/repositories/auth_repository.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';
import 'package:kaaj/features/auth/presentation/screens/password_screens.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';
import 'package:mocktail/mocktail.dart';

class _Passwords extends Mock implements PasswordRepository {}

class _Auth extends Mock implements AuthRepository {}

void main() {
  const challenge = OtpChallenge(
    id: 'recovery-test',
    phone: '+8801812345678',
    expiresInSeconds: 300,
  );
  setUpAll(() => registerFallbackValue(challenge));

  Future<AuthController> mount(
    WidgetTester tester,
    Widget screen,
    _Passwords passwords, {
    String language = 'en',
    bool large = false,
  }) async {
    final controller = AuthController(_Auth());
    await tester.binding.setSurfaceSize(const Size(360, 760));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    if (large) {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    }
    final router = GoRouter(
      initialLocation: '/test',
      routes: [
        GoRoute(path: '/test', builder: (_, _) => screen),
        GoRoute(
          path: AppRoutes.accessCheck,
          builder: (_, _) => const Scaffold(body: Text('access-check')),
        ),
        GoRoute(
          path: AppRoutes.home,
          builder: (_, _) => const Scaffold(body: Text('home')),
        ),
        GoRoute(
          path: AppRoutes.phone,
          builder: (_, _) => const Scaffold(body: Text('login')),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          passwordRepositoryProvider.overrideWithValue(passwords),
          authControllerProvider.overrideWith((ref) => controller),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          theme: buildAppTheme(),
          locale: Locale(language),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
        ),
      ),
    );
    await tester.pumpAndSettle();
    return controller;
  }

  for (final language in ['en', 'bn']) {
    testWidgets(
      'password login is localized and usable at 200% text in $language',
      (tester) async {
        await mount(
          tester,
          const PasswordLoginScreen(),
          _Passwords(),
          language: language,
          large: true,
        );
        expect(
          find.text(language == 'en' ? 'Welcome back' : 'আবার স্বাগতম'),
          findsOneWidget,
        );
        expect(find.byType(TextFormField), findsNWidgets(2));
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'recovery is paid opt-in, localized and mobile usable in $language',
      (tester) async {
        final passwords = _Passwords();
        await mount(
          tester,
          const PasswordRecoveryScreen(),
          passwords,
          language: language,
          large: true,
        );
        expect(
          tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
          isFalse,
        );
        expect(
          tester.widget<ElevatedButton>(find.byType(ElevatedButton)).onPressed,
          isNull,
        );
        expect(
          find.textContaining(
            language == 'en'
                ? 'not a free password-reset SMS'
                : 'বিনামূল্যের পাসওয়ার্ড',
          ),
          findsOneWidget,
        );
        verifyNever(() => passwords.requestRecovery(any()));
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'password login stores authentication then requires access check',
    (tester) async {
      final passwords = _Passwords();
      when(() => passwords.login(any(), any())).thenAnswer((_) async {});
      final controller = await mount(
        tester,
        const PasswordLoginScreen(),
        passwords,
      );
      await tester.enterText(find.byType(TextFormField).at(0), '01812345678');
      await tester.enterText(
        find.byType(TextFormField).at(1),
        'a long password 123',
      );
      await tester.ensureVisible(find.byType(ElevatedButton));
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();
      verify(
        () => passwords.login('+8801812345678', 'a long password 123'),
      ).called(1);
      expect(controller.state.status, AuthStatus.authenticated);
      expect(controller.state.accessChecked, isFalse);
      expect(find.text('access-check'), findsOneWidget);
    },
  );

  testWidgets('wrong password shows localized error without starting OTP', (
    tester,
  ) async {
    final passwords = _Passwords();
    when(() => passwords.login(any(), any())).thenThrow(
      const Failure(
        kind: FailureKind.unauthorized,
        message: 'Invalid',
        code: 'AUTH_INVALID_CREDENTIALS',
      ),
    );
    await mount(tester, const PasswordLoginScreen(), passwords);
    await tester.enterText(find.byType(TextFormField).at(0), '01812345678');
    await tester.enterText(find.byType(TextFormField).at(1), 'wrong password');
    await tester.ensureVisible(find.byType(ElevatedButton));
    await tester.tap(find.byType(ElevatedButton));
    await tester.pumpAndSettle();
    expect(
      find.text('The mobile number or password is incorrect.'),
      findsOneWidget,
    );
    verifyNever(() => passwords.requestRecovery(any()));
  });

  testWidgets('recovery requires a second explicit consent before verifying', (
    tester,
  ) async {
    final passwords = _Passwords();
    when(
      () => passwords.requestRecovery(any()),
    ).thenAnswer((_) async => challenge);
    when(() => passwords.reset(any(), any(), any())).thenAnswer((_) async {});
    await mount(tester, const PasswordRecoveryScreen(), passwords);
    await tester.enterText(find.byType(TextFormField), '01812345678');
    await tester.ensureVisible(find.byType(CheckboxListTile));
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    await tester.ensureVisible(find.byType(ElevatedButton));
    await tester.tap(find.byType(ElevatedButton));
    await tester.pumpAndSettle();
    expect(
      tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
      isFalse,
    );
    expect(
      tester.widget<ElevatedButton>(find.byType(ElevatedButton)).onPressed,
      isNull,
    );
    await tester.enterText(find.byType(TextFormField).at(0), '123456');
    await tester.enterText(
      find.byType(TextFormField).at(1),
      'new long password 123',
    );
    await tester.enterText(
      find.byType(TextFormField).at(2),
      'new long password 123',
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    verifyNever(() => passwords.reset(any(), any(), any()));
    await tester.ensureVisible(find.byType(CheckboxListTile));
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    await tester.ensureVisible(find.byType(ElevatedButton));
    await tester.tap(find.byType(ElevatedButton));
    await tester.pumpAndSettle();
    verify(
      () => passwords.reset(challenge, '123456', 'new long password 123'),
    ).called(1);
    expect(find.textContaining('previous sessions revoked'), findsOneWidget);
  });

  testWidgets('existing password cannot be silently overwritten in settings', (
    tester,
  ) async {
    final passwords = _Passwords();
    when(passwords.hasPassword).thenAnswer((_) async => true);
    await mount(tester, const PasswordSetupScreen(), passwords);
    expect(find.textContaining('A password is already set'), findsOneWidget);
    expect(find.byType(TextFormField), findsNothing);
    verifyNever(() => passwords.setup(any()));
  });

  testWidgets(
    'setup requires strong matching passwords and preserves the session',
    (tester) async {
      final passwords = _Passwords();
      when(passwords.hasPassword).thenAnswer((_) async => false);
      when(() => passwords.setup(any())).thenAnswer((_) async {});
      await mount(tester, const PasswordSetupScreen(), passwords);
      await tester.enterText(
        find.byType(TextFormField).at(0),
        'a long password 123',
      );
      await tester.enterText(
        find.byType(TextFormField).at(1),
        'not the same password',
      );
      await tester.ensureVisible(find.byType(ElevatedButton));
      await tester.tap(find.byType(ElevatedButton));
      await tester.pump();
      expect(find.text('Passwords do not match.'), findsOneWidget);
      verifyNever(() => passwords.setup(any()));
      await tester.enterText(
        find.byType(TextFormField).at(1),
        'a long password 123',
      );
      await tester.ensureVisible(find.byType(ElevatedButton));
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();
      verify(() => passwords.setup('a long password 123')).called(1);
    },
  );

  test('UTF-8 password limits prevent bcrypt truncation, including Bangla', () {
    expect(isValidMobilePassword('short'), isFalse);
    expect(isValidMobilePassword('a' * 72), isTrue);
    expect(isValidMobilePassword('a' * 73), isFalse);
    expect(isValidMobilePassword('অ' * 24), isTrue);
    expect(isValidMobilePassword('অ' * 25), isFalse);
    expect(isValidMobilePassword('a long\u0000password'), isFalse);
  });
}

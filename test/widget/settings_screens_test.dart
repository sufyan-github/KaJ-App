import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/localization/locale_controller.dart';
import 'package:kaaj/core/permissions/permission_gateway.dart';
import 'package:kaaj/core/theme/app_theme.dart';
import 'package:kaaj/features/auth/domain/repositories/auth_repository.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';
import 'package:kaaj/features/onboarding/data/onboarding_repository.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/onboarding/presentation/controllers/onboarding_controller.dart';
import 'package:kaaj/features/settings/data/settings_repository.dart';
import 'package:kaaj/features/settings/domain/settings_models.dart';
import 'package:kaaj/features/settings/presentation/settings_providers.dart';
import 'package:kaaj/features/settings/presentation/settings_screens.dart';
import 'package:mocktail/mocktail.dart';

void main() {
  testWidgets('language switch updates the complete visible settings UI', (
    tester,
  ) async {
    final onboarding = _MockOnboardingRepository();
    final auth = _MockAuthRepository();
    when(
      onboarding.restore,
    ).thenReturn(const OnboardingState(role: KaajRole.worker, complete: true));

    await tester.binding.setSurfaceSize(const Size(360, 760));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          onboardingControllerProvider.overrideWith(
            (ref) => OnboardingController(onboarding),
          ),
          authControllerProvider.overrideWith((ref) => AuthController(auth)),
        ],
        child: Consumer(
          builder: (context, ref, _) => MaterialApp(
            theme: buildAppTheme(),
            locale: ref.watch(localeControllerProvider),
            supportedLocales: const [Locale('bn'), Locale('en')],
            localizationsDelegates: GlobalMaterialLocalizations.delegates,
            home: const SettingsScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('সেটিংস'), findsOneWidget);
    await tester.tap(find.text('ভাষা'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('ইংরেজি'));
    await tester.pumpAndSettle();

    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);
    expect(find.text('Current role'), findsOneWidget);
    expect(find.text('Language'), findsOneWidget);
    expect(find.text('সেটিংস'), findsNothing);
    expect(find.text('ভাষা'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('settings groups real account, preference and privacy actions', (
    tester,
  ) async {
    final onboarding = _MockOnboardingRepository();
    final auth = _MockAuthRepository();
    when(
      onboarding.restore,
    ).thenReturn(const OnboardingState(role: KaajRole.worker, complete: true));

    await _pump(
      tester,
      const SettingsScreen(),
      overrides: [
        onboardingControllerProvider.overrideWith(
          (ref) => OnboardingController(onboarding),
        ),
        authControllerProvider.overrideWith((ref) => AuthController(auth)),
      ],
      textScale: 2,
    );

    expect(find.text('অ্যাকাউন্ট'), findsOneWidget);
    expect(find.text('বর্তমান কাজের মোড'), findsOneWidget);
    expect(find.text('কাজের পোর্টফোলিও'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('নোটিফিকেশন পছন্দ'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('নোটিফিকেশন পছন্দ'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('গোপনীয়তা ও অনুমতি'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('গোপনীয়তা ও অনুমতি'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('notification category switch persists its exact event type', (
    tester,
  ) async {
    final repository = _MockSettingsRepository();
    when(
      () => repository.setNotificationPreference(
        type: any(named: 'type'),
        isEnabled: any(named: 'isEnabled'),
        channel: any(named: 'channel'),
      ),
    ).thenAnswer((_) async {});

    await _pump(
      tester,
      const NotificationPreferencesScreen(
        permissionGateway: _GrantedPermissionGateway(),
      ),
      overrides: [
        settingsRepositoryProvider.overrideWithValue(repository),
        notificationPreferencesProvider.overrideWith(
          (ref) async => const [
            NotificationPreference(
              channel: 'IN_APP',
              type: 'CHAT_MESSAGE',
              isEnabled: true,
            ),
          ],
        ),
      ],
    );

    await tester.tap(find.widgetWithText(SwitchListTile, 'নতুন বার্তা'));
    await tester.pumpAndSettle();

    verify(
      () => repository.setNotificationPreference(
        type: 'CHAT_MESSAGE',
        isEnabled: false,
        channel: 'IN_APP',
      ),
    ).called(1);
    expect(find.text('নোটিফিকেশন পছন্দ সংরক্ষণ হয়েছে।'), findsOneWidget);
  });

  testWidgets('privacy screen explains data use and opens phone settings', (
    tester,
  ) async {
    final gateway = _DeniedPermissionGateway();
    await _pump(tester, PrivacySettingsScreen(permissionGateway: gateway));

    expect(find.text('যা সব সময় ব্যক্তিগত'), findsOneWidget);
    expect(find.text('ফোনের অনুমতি'), findsOneWidget);
    expect(find.text('বন্ধ'), findsNWidgets(4));
    await tester.scrollUntilVisible(
      find.text('ফোনের অনুমতি সেটিংস খুলুন'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('ফোনের অনুমতি সেটিংস খুলুন'));
    expect(gateway.openedSettings, isTrue);
  });

  testWidgets(
    'account deletion confirmation closes without controller errors',
    (tester) async {
      await _pump(
        tester,
        const DataAccountScreen(),
        overrides: [
          accountSummaryProvider.overrideWith(
            (ref) async => const AccountSummary(
              id: 'user-1',
              phone: '+8801700000000',
              activeRole: 'WORKER',
              roles: ['WORKER'],
            ),
          ),
        ],
      );

      final deleteButton = find.widgetWithText(
        OutlinedButton,
        'অ্যাকাউন্ট মুছে ফেলুন',
      );
      await tester.drag(find.byType(ListView), const Offset(0, -350));
      await tester.pumpAndSettle();
      await tester.ensureVisible(deleteButton);
      await tester.tap(deleteButton);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'পরীক্ষা');
      await tester.tap(find.widgetWithText(TextButton, 'বাতিল'));
      await tester.pumpAndSettle();

      expect(find.text('অ্যাকাউন্ট মুছে ফেলবেন?'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  List<Override> overrides = const [],
  double textScale = 1,
}) async {
  await tester.binding.setSurfaceSize(const Size(360, 760));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: buildAppTheme(),
        locale: const Locale('bn'),
        supportedLocales: const [Locale('bn'), Locale('en')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: MediaQuery(
          data: MediaQueryData(
            size: const Size(360, 760),
            textScaler: TextScaler.linear(textScale),
          ),
          child: child,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

class _MockOnboardingRepository extends Mock implements OnboardingRepository {}

class _MockAuthRepository extends Mock implements AuthRepository {}

class _MockSettingsRepository extends Mock implements SettingsRepository {}

class _GrantedPermissionGateway extends PermissionGateway {
  const _GrantedPermissionGateway();

  @override
  Future<KPermissionStatus> status(KPermission permission) async =>
      KPermissionStatus.granted;
}

class _DeniedPermissionGateway extends PermissionGateway {
  bool openedSettings = false;

  @override
  Future<KPermissionStatus> status(KPermission permission) async =>
      KPermissionStatus.denied;

  @override
  Future<bool> openSettings() async {
    openedSettings = true;
    return true;
  }
}

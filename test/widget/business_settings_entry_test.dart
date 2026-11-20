import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/settings/presentation/settings_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

void main() {
  for (final locale in const [Locale('en'), Locale('bn')]) {
    testWidgets('Settings opens My businesses (${locale.languageCode})', (
      tester,
    ) async {
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: const SettingsScreen(),
        locale: locale,
        size: const Size(400, 2400),
        overrides: [meAs(KaajRole.worker)],
      );
      expect(
        find.text(
          locale.languageCode == 'en' ? 'My businesses' : 'আমার ব্যবসা',
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const ValueKey('settings-business')));
      await tester.pumpAndSettle();
      expect(find.text('route:/businesses'), findsOneWidget);
    });
  }
}

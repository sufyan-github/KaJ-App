import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/routing/route_not_found.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

void main() {
  for (final language in ['en', 'bn']) {
    testWidgets('an unknown link explains itself and goes home ($language)', (
      tester,
    ) async {
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: const RouteNotFoundScreen(),
        locale: Locale(language),
      );
      expect(
        find.text(
          language == 'en'
              ? 'This page cannot be opened'
              : 'এই পাতাটি খোলা যাচ্ছে না',
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const ValueKey('not-found-home')));
      await tester.pumpAndSettle();
      expect(find.text('route:/home'), findsOneWidget);
    });
  }
}

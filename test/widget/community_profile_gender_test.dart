import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../features/profile/my_profile_repository_test.dart' show myProfileJson;
import '../support/fake_api.dart';
import '../support/pump_app.dart';

void main() {
  testWidgets('gender and birth year are saved when changed', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /profiles/me',
        FakeResponse.data({...myProfileJson(), 'trustLevel': 'PHONE'}),
      )
      ..on('PUT /profiles/me', FakeResponse.data({}));
    await pumpRouted(
      tester,
      api: api,
      initial: '/profile/edit',
      size: const Size(400, 1800),
    );
    expect(find.text('Gender (optional)'), findsOneWidget);
    expect(
      find.text('Women-only groups and sessions need Female here.'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const ValueKey('profile-gender')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Female').last);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('profile-birth-year')),
      '1990',
    );
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(api.called('PUT /profiles/me').single.data, {
      'displayName': 'Rahim',
      'bio': '',
      'primaryLocationId': 'loc-1',
      'gender': 'FEMALE',
      'birthYear': 1990,
    });
  });

  testWidgets('an invalid birth year is not sent (Bangla)', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /profiles/me',
        FakeResponse.data({...myProfileJson(), 'trustLevel': 'PHONE'}),
      )
      ..on('PUT /profiles/me', FakeResponse.data({}));
    await pumpRouted(
      tester,
      api: api,
      initial: '/profile/edit',
      locale: const Locale('bn'),
      size: const Size(400, 1800),
    );
    expect(find.text('লিঙ্গ (ঐচ্ছিক)'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('profile-birth-year')),
      '1800',
    );
    await tester.ensureVisible(find.text('সংরক্ষণ করুন'));
    await tester.tap(find.text('সংরক্ষণ করুন'));
    await tester.pumpAndSettle();
    expect(find.text('সঠিক জন্ম সাল লিখুন, যেমন ১৯৯৫।'), findsOneWidget);
    expect(api.called('PUT /profiles/me'), isEmpty);
  });

  testWidgets('gender is locked after identity verification', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /profiles/me',
        FakeResponse.data({
          ...myProfileJson(),
          'gender': 'FEMALE',
          'trustLevel': 'IDENTITY',
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      initial: '/profile/edit',
      size: const Size(400, 1800),
    );
    expect(
      find.text(
        'Gender cannot be changed after identity verification. '
        'Contact support to correct it.',
      ),
      findsOneWidget,
    );
    final field = tester.widget<DropdownButton<String>>(
      find.descendant(
        of: find.byKey(const ValueKey('profile-gender')),
        matching: find.byType(DropdownButton<String>),
      ),
    );
    expect(field.onChanged, isNull);
  });

  testWidgets('an empty gender is locked too after verification (B1)', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /profiles/me',
        FakeResponse.data({
          ...myProfileJson(),
          'gender': null,
          'trustLevel': 'IDENTITY',
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      initial: '/profile/edit',
      size: const Size(400, 1800),
    );
    final field = tester.widget<DropdownButton<String>>(
      find.descendant(
        of: find.byKey(const ValueKey('profile-gender')),
        matching: find.byType(DropdownButton<String>),
      ),
    );
    expect(field.onChanged, isNull);
    expect(find.textContaining('Contact support'), findsOneWidget);
  });
}

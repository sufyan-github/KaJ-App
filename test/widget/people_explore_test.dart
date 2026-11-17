import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/explore/explore_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _worker(String id, String name) => {
  'id': id,
  'displayName': name,
  'trustLevel': 'PHONE',
  'ratingAverage': '4.5',
  'ratingCount': 2,
  'completedJobsCount': 3,
  'skills': <Object>[],
  'availability': <String>[],
};

Map<String, dynamic> _mentor(String id, String name, String skill) => {
  'id': id,
  'displayName': name,
  'trustLevel': 'IDENTITY',
  'bio': 'I teach step by step, with practice.',
  'yearsExperience': 9,
  'area': {'nameEn': 'Kazla', 'nameBn': 'কাজলা'},
  'skills': [
    {'skillId': 's-$id', 'nameEn': skill, 'nameBn': skill, 'level': 'EXPERT'},
  ],
};

FakeApi _api() => FakeApi()
  ..on(
    'GET /users/workers',
    FakeResponse.data({
      'items': [_worker('w1', 'Karim')],
    }),
  )
  ..on(
    'GET /mentors',
    FakeResponse.data({
      'items': [
        _mentor('m1', 'Rafiq H.', 'House wiring'),
        _mentor('m2', 'Nasrin A.', 'Tailoring'),
      ],
      'nextCursor': null,
    }),
  );

Future<void> _openPeople(
  WidgetTester tester,
  FakeApi api, {
  String lang = 'en',
}) async {
  await pumpRouted(
    tester,
    api: api,
    home: const ExploreScreen(initial: ExploreSection.people),
    locale: Locale(lang),
    size: const Size(400, 2000),
    overrides: [meAs(KaajRole.worker)],
  );
}

void main() {
  testWidgets('people shows workers, then mentors with their skills', (
    tester,
  ) async {
    final api = _api();
    await _openPeople(tester, api);
    expect(find.text('Karim'), findsOneWidget);
    await tester.tap(find.text('Mentor'));
    await tester.pumpAndSettle();
    expect(find.text('Rafiq H.'), findsOneWidget);
    expect(find.text('House wiring'), findsOneWidget);
    expect(find.textContaining('9 years of experience'), findsWidgets);

    await tester.enterText(
      find.byKey(const ValueKey('explore-search')),
      'tailor',
    );
    await tester.pumpAndSettle();
    expect(find.text('Rafiq H.'), findsNothing);
    expect(find.text('Nasrin A.'), findsOneWidget);
  });

  testWidgets('no mentors yet (bn)', (tester) async {
    final api = _api()
      ..on('GET /mentors', FakeResponse.data({'items': <Object>[]}));
    await _openPeople(tester, api, lang: 'bn');
    await tester.tap(find.text('মেন্টর'));
    await tester.pumpAndSettle();
    expect(find.text('এখনো কোনো মেন্টর নেই'), findsOneWidget);
  });

  testWidgets('a mentor list failure explains and retries', (tester) async {
    final api = _api()
      ..on('GET /mentors', FakeResponse.error(503, 'SERVICE_UNAVAILABLE'));
    await _openPeople(tester, api);
    await tester.tap(find.text('Mentor'));
    await tester.pumpAndSettle();
    expect(find.textContaining('KAAJ is busy'), findsOneWidget);
    api.on('GET /mentors', FakeResponse.data({'items': <Object>[]}));
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('No mentors yet'), findsOneWidget);
  });

  testWidgets('the People chip is on the Explore chip row', (tester) async {
    await pumpRouted(
      tester,
      api: _api(),
      home: const ExploreScreen(),
      overrides: [meAs(KaajRole.customer)],
    );
    await tester.tap(find.byKey(const ValueKey('explore-people')));
    await tester.pumpAndSettle();
    expect(find.text('Karim'), findsOneWidget);
  });
}

// The home hub: quick numbers, the six parts of KAAJ, real jobs and a small
// grid of shortcuts.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kaaj/features/home/presentation/screens/home_screen.dart';
import 'package:kaaj/features/notifications/domain/app_notification.dart';
import 'package:kaaj/features/notifications/presentation/controllers/notifications_providers.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _job(String id) => {
  'id': id,
  'title': 'Job $id',
  'description': 'Some work to do in the area.',
  'status': 'APPLICATIONS_OPEN',
  'category': {'id': 'cat-1', 'name_bn': 'মেরামত', 'name_en': 'Repairs'},
  'location': {'name_bn': 'বোয়ালিয়া', 'name_en': 'Boalia'},
  'skills': <Object>[],
};

Map<String, dynamic> _assignment(String id, String status) => {
  'id': id,
  'title': 'Assignment $id',
  'status': status,
  'isWorker': true,
  'isPoster': false,
};

void main() {
  final quiet = [
    notificationsProvider.overrideWith(
      (ref) async => const NotificationInbox(items: [], unreadCount: 0),
    ),
  ];

  Future<GoRouter> pumpHome(
    WidgetTester tester,
    FakeApi api, {
    KaajRole role = KaajRole.worker,
    Size size = const Size(400, 2400),
  }) => pumpRouted(
    tester,
    api: api,
    home: const HomeScreen(),
    size: size,
    overrides: [...quiet, meAs(role)],
  );

  testWidgets('shows at most three real jobs, each opening its page', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /jobs',
        FakeResponse.data({
          'items': [_job('1'), _job('2'), _job('3'), _job('4')],
        }),
      );
    final router = await pumpHome(tester, api);

    expect(find.text('Jobs for you'), findsOneWidget);
    expect(find.text('Job 1'), findsOneWidget);
    expect(find.text('Job 3'), findsOneWidget);
    expect(find.text('Job 4'), findsNothing);

    await tester.tap(find.text('Job 2'));
    await tester.pumpAndSettle();
    // The test router has its own page for /jobs/:id.
    expect(
      router.routerDelegate.currentConfiguration.last.matchedLocation,
      '/jobs/2',
    );
  });

  testWidgets('says so when no job matches, and when jobs cannot load', (
    tester,
  ) async {
    await pumpHome(
      tester,
      FakeApi()..on('GET /jobs', FakeResponse.data({'items': <Object>[]})),
    );
    expect(find.text('No jobs match you right now.'), findsOneWidget);

    // No answer for /jobs at all: the section explains and offers a retry.
    await pumpHome(tester, FakeApi());
    expect(find.text("Couldn't load jobs."), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('counts only work that is still going, and shows a dash '
      'when the server gives no number', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /assignments',
        FakeResponse.data({
          'items': [
            _assignment('a', 'CONFIRMED'),
            _assignment('b', 'IN_PROGRESS'),
            _assignment('c', 'COMPLETED'),
            _assignment('d', 'CANCELLED'),
          ],
        }),
      );
    await pumpHome(tester, api);

    final active = find.ancestor(
      of: find.text('Active work'),
      matching: find.byType(InkWell),
    );
    expect(
      find.descendant(of: active, matching: find.text('2')),
      findsOneWidget,
    );
    // Sessions and certificates were not answered: a dash, never a zero.
    expect(find.text('—'), findsNWidgets(2));

    await tester.tap(find.text('Active work'));
    await tester.pumpAndSettle();
    expect(find.text('route:/assignments'), findsOneWidget);
  });

  for (final (label, section) in const [
    ('Work', 'work'),
    ('Learn', 'learn'),
    ('Business', 'business'),
    ('Ideas', 'ideas'),
    ('Community', 'community'),
    ('People', 'people'),
  ]) {
    testWidgets('the $label tile opens that part of Explore', (tester) async {
      await pumpHome(tester, FakeApi());
      await tester.tap(find.byKey(ValueKey('home-pillar-$section')));
      await tester.pumpAndSettle();
      expect(find.text('route:/explore?section=$section'), findsOneWidget);
    });
  }

  testWidgets('the profile card shows the next step, and the rest on request', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /profiles/me',
        FakeResponse.data({
          'displayName': 'Rahim',
          'activeRole': 'WORKER',
          'completeness': {
            'percent': 35,
            'missing': ['PHOTO', 'BIO', 'IDENTITY'],
          },
        }),
      );
    await pumpHome(tester, api);

    expect(find.text('Add a profile photo'), findsOneWidget);
    expect(find.byKey(const ValueKey('completeness-identity')), findsNothing);

    await tester.tap(find.text('Show all steps'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('completeness-identity')), findsOneWidget);
    expect(find.text('Show less'), findsOneWidget);
  });

  testWidgets('worker shortcuts reach the screens with no other way in', (
    tester,
  ) async {
    await pumpHome(tester, FakeApi());
    for (final route in const [
      '/assignments',
      '/w/availability',
      '/w/profile/skills',
      '/settings/job-alerts',
      '/reviews',
      '/w/profile/portfolio',
      '/workers/preview',
      '/help',
    ]) {
      expect(
        find.byKey(ValueKey('home-shortcut-$route')),
        findsOneWidget,
        reason: route,
      );
    }
    await tester.tap(find.byKey(const ValueKey('home-shortcut-/reviews')));
    await tester.pumpAndSettle();
    expect(find.text('route:/reviews'), findsOneWidget);
  });

  testWidgets('a customer gets posting, their numbers and their shortcuts', (
    tester,
  ) async {
    await pumpHome(tester, FakeApi(), role: KaajRole.customer);

    expect(find.text('What work do you need done?'), findsOneWidget);
    expect(find.text('Your posts'), findsOneWidget);
    expect(find.text('Jobs for you'), findsNothing);
    expect(
      find.byKey(const ValueKey('home-shortcut-/favorites')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('home-shortcut-/w/availability')),
      findsNothing,
    );
  });

  testWidgets('fits a small phone at large text in Bangla', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /jobs',
        FakeResponse.data({
          'items': [_job('1')],
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const HomeScreen(),
      size: const Size(320, 2400),
      locale: const Locale('bn'),
      overrides: [...quiet, meAs(KaajRole.worker)],
    );
    expect(tester.takeException(), isNull);
  });
}

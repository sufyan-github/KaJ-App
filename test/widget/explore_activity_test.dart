import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/activity/my_activity_screen.dart';
import 'package:kaaj/features/explore/explore_screen.dart';
import 'package:kaaj/features/home/presentation/screens/home_screen.dart';
import 'package:kaaj/features/notifications/domain/app_notification.dart';
import 'package:kaaj/features/notifications/presentation/controllers/notifications_providers.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';
import '../support/training_fixtures.dart';

Map<String, dynamic> _job(String id, String title) => {
  'id': id,
  'title': title,
  'description': 'Work in the area.',
  'status': 'APPLICATIONS_OPEN',
  'category': {'id': 'cat-1', 'name_bn': 'মেরামত', 'name_en': 'Repairs'},
  'location': {'name_bn': 'বোয়ালিয়া', 'name_en': 'Boalia'},
  'skills': <Object>[],
};

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

FakeApi _api() => FakeApi()
  ..on('GET /learning-opportunities', FakeResponse.data({'items': <Object>[]}))
  ..on(
    'GET /jobs',
    FakeResponse.data({
      'items': [_job('1', 'Fix a tap'), _job('2', 'Paint a gate')],
    }),
  )
  ..on(
    'GET /users/workers',
    FakeResponse.data({
      'items': [_worker('w1', 'Karim'), _worker('w2', 'Salma')],
    }),
  )
  ..on(
    'GET /training/courses',
    FakeResponse.data({
      'items': [
        courseJson(id: 'c1', titleEn: 'Safe home cleaning'),
        courseJson(
          id: 'c2',
          titleEn: 'Basic wiring',
          titleBn: 'বেসিক ওয়্যারিং',
        ),
      ],
    }),
  );

void main() {
  group('Explore', () {
    testWidgets('a worker searches work, then switches to Learn', (
      tester,
    ) async {
      await pumpRouted(
        tester,
        api: _api(),
        home: const ExploreScreen(),
        size: const Size(400, 3000),
        overrides: [meAs(KaajRole.worker)],
      );
      expect(find.text('Fix a tap'), findsOneWidget);
      expect(find.text('Paint a gate'), findsOneWidget);

      await tester.enterText(
        find.byKey(const ValueKey('explore-search')),
        'gate',
      );
      await tester.pumpAndSettle();
      expect(find.text('Fix a tap'), findsNothing);
      expect(find.text('Paint a gate'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('explore-learn')));
      await tester.pumpAndSettle();
      // Learning with a mentor comes first; the courses are next to it.
      expect(find.text('With a mentor'), findsOneWidget);
      await tester.tap(find.text('Online courses'));
      await tester.pumpAndSettle();
      expect(find.text('Nothing matches your search.'), findsOneWidget);

      await tester.enterText(
        find.byKey(const ValueKey('explore-search')),
        'wiring',
      );
      await tester.pumpAndSettle();
      expect(find.text('Basic wiring'), findsOneWidget);
      expect(find.text('Safe home cleaning'), findsNothing);
    });

    testWidgets('a client sees workers to book under Work (bn)', (
      tester,
    ) async {
      await pumpRouted(
        tester,
        api: _api(),
        home: const ExploreScreen(),
        locale: const Locale('bn'),
        overrides: [meAs(KaajRole.customer)],
      );
      expect(find.text('খুঁজুন ও জানুন'), findsOneWidget);
      expect(find.text('Karim'), findsOneWidget);
      await tester.enterText(
        find.byKey(const ValueKey('explore-search')),
        'sal',
      );
      await tester.pumpAndSettle();
      expect(find.text('Karim'), findsNothing);
      expect(find.text('Salma'), findsOneWidget);
    });

    testWidgets('opens straight on Learn from a link', (tester) async {
      await pumpRouted(
        tester,
        api: _api(),
        home: const ExploreScreen(initial: ExploreSection.learn),
        overrides: [meAs(KaajRole.customer)],
      );
      expect(find.text('No ways to learn yet'), findsOneWidget);
      await tester.tap(find.text('Online courses'));
      await tester.pumpAndSettle();
      expect(find.text('Safe home cleaning'), findsOneWidget);
    });

    testWidgets('a failed load explains the server reason', (tester) async {
      final api = _api()
        ..on('GET /jobs', FakeResponse.error(403, 'ACCOUNT_RESTRICTED'));
      await pumpRouted(
        tester,
        api: api,
        home: const ExploreScreen(),
        overrides: [meAs(KaajRole.worker)],
      );
      expect(find.textContaining('temporarily restricted'), findsOneWidget);
    });
  });

  group('My activity', () {
    testWidgets('jobs and bookings, then learning with its empty state', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /assignments', FakeResponse.data({'items': <Object>[]}))
        ..on('GET /training/courses', FakeResponse.data({'items': <Object>[]}));
      await pumpRouted(tester, api: api, home: const MyActivityScreen());
      expect(find.text('My activity'), findsOneWidget);
      expect(api.called('GET /assignments'), hasLength(1));

      await tester.tap(find.text('Learn'));
      await tester.pumpAndSettle();
      expect(find.text('You have not started learning yet'), findsOneWidget);
      expect(api.called('GET /training/courses').single.query['scope'], 'mine');
      await tester.tap(find.byKey(const ValueKey('activity-explore-learn')));
      await tester.pumpAndSettle();
      expect(find.text('route:/explore?section=learn'), findsOneWidget);
    });

    testWidgets('learning lists my courses (bn)', (tester) async {
      final api = FakeApi()
        ..on(
          'GET /training/courses',
          FakeResponse.data({
            'items': [courseJson(id: 'c1')],
          }),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const MyActivityScreen(initialSection: 1),
        locale: const Locale('bn'),
      );
      expect(find.text('নিরাপদ ঘর পরিষ্কার'), findsOneWidget);
    });

    testWidgets('learning shows a server error with retry', (tester) async {
      final api = FakeApi()
        ..on(
          'GET /training/courses',
          FakeResponse.error(503, 'SERVICE_UNAVAILABLE'),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const MyActivityScreen(initialSection: 1),
      );
      expect(find.textContaining('KAAJ is busy'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    });
  });

  testWidgets('the bottom bar opens Explore and My activity', (tester) async {
    await pumpRouted(
      tester,
      api: FakeApi(),
      home: const HomeScreen(),
      overrides: [
        meAs(KaajRole.worker),
        notificationsProvider.overrideWith(
          (ref) async => const NotificationInbox(items: [], unreadCount: 0),
        ),
      ],
    );
    await tester.tap(find.byIcon(Icons.travel_explore));
    await tester.pumpAndSettle();
    expect(find.text('route:/explore'), findsOneWidget);
  });
}

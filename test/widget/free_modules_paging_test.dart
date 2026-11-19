import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/routing/app_router.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';
import 'package:kaaj/features/explore/people_explore.dart';
import 'package:kaaj/features/learning/presentation/learn_explore.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/profile/domain/me.dart';
import 'package:kaaj/features/profile/domain/my_profile.dart';
import 'package:kaaj/features/profile/presentation/controllers/me_provider.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _opportunity(String id, String title) => {
  'id': id,
  'opportunityType': 'TRAINING',
  'title': title,
  'description': 'Practice with a mentor.',
  'status': 'APPLICATIONS_OPEN',
  'participantTerms': 'FREE',
  'seats': 6,
  'seatsFilled': 2,
  'startsAt': '2026-11-21T04:00:00Z',
  'workArrangement': 'ON_SITE',
  'flexibleHours': false,
  'skills': <Object>[],
};

Map<String, dynamic> _mentor(String id, String name) => {
  'id': id,
  'displayName': name,
  'trustLevel': 'IDENTITY',
  'skills': <Object>[],
};

final _meWithSkill = meProvider.overrideWith(
  (ref) async => Me(
    userId: 'user-1',
    phone: '+8801812345678',
    roles: const ['WORKER'],
    activeRole: 'WORKER',
    displayName: 'Rahim',
    skills: const [
      MySkill(
        skillId: 'skill-7',
        slug: 'tailoring',
        nameEn: 'Tailoring',
        nameBn: 'দর্জির কাজ',
        level: 'BEGINNER',
        hasPriorTraining: false,
      ),
    ],
    area: const ProfileArea(
      id: 'area-1',
      nameEn: 'Boalia',
      nameBn: 'বোয়ালিয়া',
    ),
  ),
);

void main() {
  group('without a subscription', () {
    const free = AuthState(
      status: AuthStatus.authenticated,
      subscriptionAccess: false,
      freeModules: {'LEARN', 'COMMUNITY'},
    );
    const none = AuthState(
      status: AuthStatus.authenticated,
      subscriptionAccess: false,
    );

    test('Learn detail, enrolment, publishing and mentor stay open', () {
      for (final route in [
        AppRoutes.learningOpportunity('o1'),
        AppRoutes.learningEnrolment('e1'),
        AppRoutes.publishLearning,
        AppRoutes.mentor,
      ]) {
        expect(authRedirect(free, route), isNull, reason: route);
      }
    });

    test('Business and Ideas are free even on an older server', () {
      for (final route in [
        '/businesses/b1',
        '/business/mine',
        '/partners',
        '/collaboration-requests/c1',
        '/ideas/i1/access',
      ]) {
        expect(authRedirect(free, route), isNull, reason: route);
        expect(authRedirect(none, route), isNull, reason: route);
      }
    });

    test('Community screens follow the server flag', () {
      for (final route in [
        '/community/groups/g1',
        '/sessions/s1',
        '/introductions/i1',
      ]) {
        expect(authRedirect(free, route), isNull, reason: route);
        expect(authRedirect(none, route), AppRoutes.subscription);
      }
      expect(authRedirect(free, AppRoutes.chatThread('c1')), isNull);
      expect(
        authRedirect(none, AppRoutes.chatThread('c1')),
        AppRoutes.subscription,
      );
    });

    test('Work keeps the paywall', () {
      for (final route in [
        AppRoutes.jobs,
        AppRoutes.workers,
        AppRoutes.assignments,
        '/learnings',
        '/mentorship',
      ]) {
        expect(authRedirect(free, route), AppRoutes.subscription);
      }
    });
  });

  testWidgets('Learn pages past the first 20 and filters by my skill and '
      'area', (tester) async {
    final api = FakeApi()
      ..onRequest(
        'GET /learning-opportunities',
        (request) => request.query['cursor'] == 'next-1'
            ? FakeResponse.data({
                'items': [_opportunity('o2', 'Second page course')],
                'nextCursor': null,
              })
            : FakeResponse.data({
                'items': [_opportunity('o1', 'First page course')],
                'nextCursor': 'next-1',
              }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const Scaffold(body: LearnExploreBody()),
      size: const Size(400, 2000),
      overrides: [_meWithSkill],
    );
    expect(find.text('First page course'), findsOneWidget);
    expect(find.text('Second page course'), findsNothing);
    expect(api.called('GET /learning-opportunities').single.query, isEmpty);

    await tester.tap(find.byKey(const ValueKey('learn-load-more')));
    await tester.pumpAndSettle();
    expect(find.text('First page course'), findsOneWidget);
    expect(find.text('Second page course'), findsOneWidget);
    expect(find.byKey(const ValueKey('learn-load-more')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('learn-skill-skill-7')));
    await tester.pumpAndSettle();
    expect(api.called('GET /learning-opportunities').last.query, {
      'skillId': 'skill-7',
    });
    expect(find.text('Second page course'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('learn-near-me')));
    await tester.pumpAndSettle();
    expect(api.called('GET /learning-opportunities').last.query, {
      'skillId': 'skill-7',
      'locationId': 'area-1',
    });
    expect(find.text('In my area'), findsOneWidget);
  });

  testWidgets('mentor directory pages and filters (bn)', (tester) async {
    final api = FakeApi()
      ..onRequest(
        'GET /mentors',
        (request) => request.query['cursor'] == 'm-next'
            ? FakeResponse.data({
                'items': [_mentor('m2', 'Nasrin A.')],
              })
            : FakeResponse.data({
                'items': [_mentor('m1', 'Rafiq H.')],
                'nextCursor': 'm-next',
              }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const Scaffold(body: MentorDirectory()),
      locale: const Locale('bn'),
      size: const Size(400, 2000),
      overrides: [_meWithSkill],
    );
    expect(find.text('Rafiq H.'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('mentors-load-more')));
    await tester.pumpAndSettle();
    expect(find.text('Nasrin A.'), findsOneWidget);
    expect(find.text('দর্জির কাজ'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('mentors-near-me')));
    await tester.pumpAndSettle();
    expect(api.called('GET /mentors').last.query, {'locationId': 'area-1'});
  });

  testWidgets('no area and no skills: no personal filter chips', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET /mentors', FakeResponse.data({'items': <Object>[]}));
    await pumpRouted(
      tester,
      api: api,
      home: const Scaffold(body: MentorDirectory()),
      overrides: [meAs(KaajRole.customer, areaId: null)],
    );
    expect(find.byKey(const ValueKey('mentors-near-me')), findsNothing);
    expect(find.text('No mentors yet'), findsOneWidget);
  });
}

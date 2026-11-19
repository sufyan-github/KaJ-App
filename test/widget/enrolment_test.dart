import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/widgets/k_text_field.dart';
import 'package:kaaj/features/activity/my_activity_screen.dart';
import 'package:kaaj/features/learning/presentation/enrolment_screens.dart';
import 'package:kaaj/features/training/presentation/screens/certificates_screen.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';
import '../support/training_fixtures.dart';

Map<String, dynamic> _enrolment({
  bool mentor = false,
  String status = 'CONFIRMED',
  List<Map<String, dynamic>>? sessions,
  Map<String, dynamic>? completion,
}) {
  final items =
      sessions ??
      [
        {
          'id': 's1',
          'heldAt': '2026-11-15T04:00:00Z',
          'minutes': 90,
          'topic': 'Switch boards',
          'notes': null,
          'learnerConfirmedAt': null,
        },
      ];
  return {
    'id': 'e1',
    'role': mentor ? 'MENTOR' : 'LEARNER',
    'status': status,
    'opportunity': {
      'id': 'opp-1',
      'title': 'House wiring apprenticeship',
      'opportunityType': 'APPRENTICESHIP',
    },
    'learner': {'userId': 'l1', 'displayName': 'Shila A.'},
    'mentorUserId': 'm1',
    'contract': {
      'version': 1,
      'kind': 'LEARNING',
      'terms': 'STIPEND',
      'stipendPoisha': '300000',
      'participantFeePoisha': null,
      'schedule': {
        'startsAt': '2026-11-14T04:00:00Z',
        'endsAt': '2026-12-14T08:00:00Z',
        'flexibleHours': false,
      },
      'deliveryMode': {'code': 'IN_PERSON', 'en': 'In person', 'bn': 'সরাসরি'},
    },
    'sessions': items,
    'progress': {
      'sessionsRecorded': items.length,
      'sessionsConfirmed': items
          .where((item) => item['learnerConfirmedAt'] != null)
          .length,
      'minutesTotal': items.fold<int>(
        0,
        (sum, item) => sum + (item['minutes']! as int),
      ),
    },
    'completionRecord': completion,
    'viewerIsLearner': !mentor,
  };
}

Future<FakeApi> _open(
  WidgetTester tester,
  Map<String, dynamic> enrolment, {
  Locale locale = const Locale('en'),
}) async {
  final api = FakeApi()
    ..on('GET /learning-enrolments/e1', FakeResponse.data(enrolment));
  await pumpRouted(
    tester,
    api: api,
    home: const EnrolmentScreen(enrolmentId: 'e1'),
    locale: locale,
    size: const Size(400, 2400),
  );
  return api;
}

void main() {
  group('learner', () {
    testWidgets('sees the agreed terms, progress and confirms a session', (
      tester,
    ) async {
      final api = await _open(tester, _enrolment());
      expect(find.text('Terms agreed at acceptance'), findsOneWidget);
      expect(find.text('You receive an allowance: ৳3,000'), findsOneWidget);
      expect(find.text('In person'), findsOneWidget);
      expect(
        find.text('Sessions: 1 · Confirmed: 0 · Total minutes: 90'),
        findsOneWidget,
      );

      final confirmed = _enrolment(
        sessions: [
          {
            'id': 's1',
            'heldAt': '2026-11-15T04:00:00Z',
            'minutes': 90,
            'topic': 'Switch boards',
            'learnerConfirmedAt': '2026-11-15T09:00:00Z',
          },
        ],
      );
      api
        ..on('POST /learning-sessions/s1/confirm', FakeResponse.data(confirmed))
        ..on('GET /learning-enrolments/e1', FakeResponse.data(confirmed));
      await tester.tap(find.byKey(const ValueKey('confirm-s1')));
      await tester.pumpAndSettle();
      expect(api.called('POST /learning-sessions/s1/confirm'), hasLength(1));
      expect(
        find.text('Sessions: 1 · Confirmed: 1 · Total minutes: 90'),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('record-session')), findsNothing);
    });

    testWidgets('a practical certificate can be shared (bn)', (tester) async {
      await _open(
        tester,
        _enrolment(
          status: 'COMPLETED',
          completion: {
            'id': 'c1',
            'code': 'PRX42',
            'evidenceLevel': 'PRACTICAL_CHECKED',
            'issuedAt': '2026-12-14T09:00:00Z',
            'status': 'VALID',
            'verifyPath': '/api/v1/certificates/PRX42',
          },
        ),
        locale: const Locale('bn'),
      );
      expect(
        find.text('অনুশীলনের সার্টিফিকেট (মেন্টরের যাচাই)'),
        findsOneWidget,
      );
      expect(find.textContaining('PRX42'), findsOneWidget);
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            copied = (call.arguments as Map)['text'] as String?;
          }
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      await tester.tap(find.byKey(const ValueKey('share-practical')));
      await tester.pumpAndSettle();
      expect(find.text('শেয়ার করার লেখা কপি হয়েছে।'), findsOneWidget);
      expect(copied, contains('PRX42'));
      expect(copied, contains('হাতে-কলমে'));
    });
  });

  group('mentor', () {
    testWidgets('records a session; a future date is refused in place', (
      tester,
    ) async {
      final api = await _open(tester, _enrolment(mentor: true));
      expect(find.text('You are the mentor'), findsOneWidget);
      expect(find.textContaining('Shila A.'), findsOneWidget);

      api.on(
        'POST /learning-enrolments/e1/sessions',
        FakeResponse.error(409, 'SESSION_IN_FUTURE'),
      );
      await tester.tap(find.byKey(const ValueKey('record-session')));
      await tester.pumpAndSettle();
      final fields = tester
          .widgetList<KTextField>(find.byType(KTextField))
          .toList();
      fields[0].controller!.text = 'Wiring a fan';
      fields[1].controller!.text = '৪৫';
      await tester.tap(find.byKey(const ValueKey('save-session')));
      await tester.pumpAndSettle();
      expect(
        find.text('A session can only be recorded after it has happened.'),
        findsOneWidget,
      );

      api.on(
        'POST /learning-enrolments/e1/sessions',
        FakeResponse.data(_enrolment(mentor: true)),
      );
      await tester.tap(find.byKey(const ValueKey('save-session')));
      await tester.pumpAndSettle();
      final body =
          api.called('POST /learning-enrolments/e1/sessions').last.data! as Map;
      expect(body['topic'], 'Wiring a fan');
      expect(body['minutes'], 45);
      expect(find.byType(AlertDialog), findsNothing);
    });

    testWidgets('completion needs a confirmed session, then issues it', (
      tester,
    ) async {
      final api = await _open(tester, _enrolment(mentor: true));
      api.on(
        'POST /learning-enrolments/e1/complete',
        FakeResponse.error(409, 'NO_CONFIRMED_SESSIONS'),
      );
      await tester.tap(find.byKey(const ValueKey('complete-learning')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Complete'));
      await tester.pumpAndSettle();
      expect(
        find.text('The learner must confirm at least one session first.'),
        findsOneWidget,
      );

      final done = _enrolment(
        mentor: true,
        status: 'COMPLETED',
        completion: {
          'id': 'c1',
          'code': 'PRX42',
          'issuedAt': '2026-12-14T09:00:00Z',
          'status': 'VALID',
          'verifyPath': '/api/v1/certificates/PRX42',
        },
      );
      api
        ..on('POST /learning-enrolments/e1/complete', FakeResponse.data(done))
        ..on('GET /learning-enrolments/e1', FakeResponse.data(done));
      await tester.tap(find.byKey(const ValueKey('complete-learning')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Complete'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('completion-record')), findsOneWidget);
      expect(find.byKey(const ValueKey('complete-learning')), findsNothing);
      expect(find.byKey(const ValueKey('share-practical')), findsNothing);
    });

    testWidgets('accepts a learner; a full course says so', (tester) async {
      final api = FakeApi()
        ..on(
          'GET /learning-opportunities/opp-1/applications',
          FakeResponse.data({
            'items': [
              {
                'id': 'a1',
                'status': 'PENDING',
                'message': 'I can come on Saturdays.',
                'learner': {'userId': 'l1', 'displayName': 'Shila A.'},
              },
            ],
          }),
        )
        ..on(
          'POST /learning-applications/a1/accept',
          FakeResponse.error(409, 'SEATS_FULL'),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const Scaffold(
          body: SingleChildScrollView(
            child: MentorApplicationsPanel(opportunityId: 'opp-1'),
          ),
        ),
      );
      expect(find.text('Shila A.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('accept-a1')));
      await tester.pumpAndSettle();
      expect(find.text('All seats are taken.'), findsOneWidget);

      api.on(
        'POST /learning-applications/a1/accept',
        FakeResponse.data({'id': 'e1'}),
      );
      await tester.tap(find.byKey(const ValueKey('accept-a1')));
      await tester.pumpAndSettle();
      expect(api.called('POST /learning-applications/a1/accept'), hasLength(2));
      expect(
        find.text('Learner accepted. Keep track of progress in My activity.'),
        findsOneWidget,
      );
    });
  });

  testWidgets('My activity lists enrolments and opens one', (tester) async {
    final api = FakeApi()
      ..on('GET /training/courses', FakeResponse.data({'items': <Object>[]}))
      ..on(
        'GET /learning-enrolments',
        FakeResponse.data({
          'items': [_enrolment()],
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const MyActivityScreen(initialSection: ActivitySection.learning),
    );
    expect(find.text('Learning with a mentor'), findsOneWidget);
    await tester.tap(find.text('House wiring apprenticeship'));
    await tester.pumpAndSettle();
    expect(find.text('route:/learn/enrolments/e1'), findsOneWidget);
  });

  testWidgets('practical certificates sit with quiz ones', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /me/certificates',
        FakeResponse.data({
          'items': [
            certificateJson(),
            {
              ...certificateJson(id: 'cert-2'),
              'kind': 'PRACTICAL',
              'title': 'House wiring apprenticeship',
              'code': 'PRX42',
              'evidenceLevel': 'PRACTICAL_CHECKED',
              'issuedBy': {'userId': 'm1', 'displayName': 'Rafiq H.'},
            },
          ],
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const CertificatesScreen(),
      size: const Size(400, 2000),
    );
    expect(find.text('House wiring apprenticeship'), findsOneWidget);
    expect(find.text('Hands-on learning checked by a mentor'), findsOneWidget);
    expect(find.textContaining('Mentor: Rafiq H.'), findsOneWidget);
    expect(find.text('Safe home cleaning'), findsOneWidget);
  });
}

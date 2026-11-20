import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/community/presentation/consultation_booking_screen.dart';
import 'package:kaaj/features/community/presentation/session_detail_screen.dart';
import 'package:kaaj/features/community/presentation/session_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

DateTime _tomorrowAt(int hour) {
  final now = DateTime.now().add(const Duration(days: 1));
  return DateTime(now.year, now.month, now.day, hour);
}

Map<String, dynamic> _session({
  String id = 's1',
  String kind = 'GROUP_DISCUSSION',
  String status = 'SCHEDULED',
  String mode = 'IN_PERSON',
  String? myRole = 'PARTICIPANT',
  String? myStatus,
  int? waitlistPosition,
  String? groupId = 'g1',
  String priceModel = 'FREE',
  String? onlineLink,
  DateTime? startsAt,
  List<Map<String, dynamic>> participants = const [],
}) {
  final start = startsAt ?? _tomorrowAt(10);
  return {
    'id': id,
    'kind': kind,
    'title': 'Tailoring basics',
    'description': 'Bring your own cloth.',
    'subject': groupId == null ? null : {'type': 'GROUP', 'id': groupId},
    'status': status,
    'startsAt': start.toUtc().toIso8601String(),
    'endsAt': start.add(const Duration(hours: 1)).toUtc().toIso8601String(),
    'durationMinutes': 60,
    'mode': mode,
    'area': {'id': 'a1', 'nameEn': 'Kazla', 'nameBn': 'কাজলা'},
    'onlineLink': onlineLink,
    'capacity': 2,
    'placesTaken': 2,
    'priceModel': priceModel,
    'pricePoisha': priceModel == 'CASH' ? '20000' : null,
    'womenOnly': false,
    'homeBasedFriendly': false,
    'host': {'userId': 'u-host', 'displayName': 'Rafiq H.'},
    'expert': null,
    'introductionId': null,
    'groupId': groupId,
    'myCheckedInAt': null,
    'waitlistPosition': waitlistPosition,
    'myRole': myRole,
    'myStatus': myStatus,
    'cancelReason': null,
    'completedAt': status == 'COMPLETED' ? start.toIso8601String() : null,
    'participants': participants,
    'createdAt': '2026-11-19T10:00:00.000Z',
  };
}

void main() {
  group('consultation booking', () {
    testWidgets('a free time is chosen and the request is sent', (
      tester,
    ) async {
      final start = _tomorrowAt(10);
      final api = FakeApi()
        ..on(
          'GET /experts/u-exp/slots',
          FakeResponse.data({
            'expertUserId': 'u-exp',
            'slots': [
              {
                'startsAt': start.toUtc().toIso8601String(),
                'endsAt': start
                    .add(const Duration(hours: 1))
                    .toUtc()
                    .toIso8601String(),
              },
            ],
          }),
        )
        ..on(
          'POST /sessions/consultations',
          FakeResponse.error(409, 'SLOT_UNAVAILABLE'),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const ConsultationBookingScreen(
          expertUserId: 'u-exp',
          expertName: 'Rafiq H.',
          introductionId: 'i1',
        ),
        size: const Size(400, 1800),
      );
      final query = api.called('GET /experts/u-exp/slots').single.query;
      expect(query.keys, containsAll(['from', 'to']));

      await tester.tap(find.byKey(const ValueKey('booking-send')));
      await tester.pumpAndSettle();
      expect(find.text('Choose a time.'), findsOneWidget);

      final slotKey = ValueKey('slot-${start.toUtc().toIso8601String()}');
      await tester.tap(find.byKey(slotKey));
      await tester.pumpAndSettle();
      // A one hour slot fits 30, 45 and 60 minutes.
      expect(find.byKey(const ValueKey('duration-90')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('duration-60')));
      await tester.tap(find.byKey(const ValueKey('mode-IN_APP_CHAT')));
      await tester.enterText(
        find.byKey(const ValueKey('booking-note')),
        'About my shop',
      );
      await tester.tap(find.byKey(const ValueKey('booking-send')));
      await tester.pumpAndSettle();

      expect(api.called('POST /sessions/consultations').single.data, {
        'expertUserId': 'u-exp',
        'startsAt': start.toUtc().toIso8601String(),
        'durationMinutes': 60,
        'mode': 'IN_APP_CHAT',
        'note': 'About my shop',
        'introductionId': 'i1',
      });
      expect(
        find.text('The expert is not free at that time. Choose another time.'),
        findsOneWidget,
      );

      api.on(
        'POST /sessions/consultations',
        FakeResponse.data(
          _session(kind: 'CONSULTATION', status: 'DRAFT', groupId: null),
        ),
      );
      await tester.tap(find.byKey(slotKey));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('booking-send')));
      await tester.pumpAndSettle();
      expect(find.text('route:/sessions/s1'), findsOneWidget);
    });

    testWidgets('an expert who is not available shows not available', (
      tester,
    ) async {
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: const ConsultationBookingScreen(expertUserId: 'u-x'),
      );
      expect(find.text('This is not available'), findsOneWidget);
    });
  });

  group('sessions list', () {
    testWidgets('attending and hosting tabs', (tester) async {
      final api = FakeApi()
        ..onRequest(
          'GET /sessions',
          (request) => request.query['role'] == 'hosting'
              ? FakeResponse.data({'items': [], 'nextCursor': null})
              : FakeResponse.data({
                  'items': [_session(myStatus: 'ACCEPTED')],
                  'nextCursor': null,
                }),
        );
      await pumpRouted(tester, api: api, home: const SessionsScreen());
      expect(find.text('Tailoring basics'), findsOneWidget);
      expect(find.text('Confirmed'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('sessions-hosting')));
      await tester.pumpAndSettle();
      expect(find.text('You are not hosting any sessions'), findsOneWidget);
    });
  });

  group('session detail', () {
    testWidgets('a group member RSVPs to the waitlist, then leaves', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /sessions/s1', FakeResponse.data(_session()))
        ..on(
          'POST /sessions/s1/rsvp',
          FakeResponse.data(
            _session(myStatus: 'WAITLISTED', waitlistPosition: 2),
          ),
        )
        ..on(
          'POST /sessions/s1/leave',
          FakeResponse.data(_session(myStatus: 'DECLINED')),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const SessionDetailScreen(sessionId: 's1'),
        size: const Size(400, 1600),
      );
      expect(find.text('Rafiq H.'), findsOneWidget);
      expect(find.byKey(const ValueKey('session-cancel')), findsNothing);

      api.on(
        'GET /sessions/s1',
        FakeResponse.data(
          _session(myStatus: 'WAITLISTED', waitlistPosition: 2),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('session-rsvp')));
      await tester.pumpAndSettle();
      expect(api.called('POST /sessions/s1/rsvp'), hasLength(1));
      expect(find.text('Your place on the waitlist'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('session-leave')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('confirm-action')));
      await tester.pumpAndSettle();
      expect(api.called('POST /sessions/s1/leave'), hasLength(1));
    });

    testWidgets('a women-only refusal is explained', (tester) async {
      final api = FakeApi()
        ..on('GET /sessions/s1', FakeResponse.data(_session()))
        ..on('POST /sessions/s1/rsvp', FakeResponse.error(409, 'WOMEN_ONLY'));
      await pumpRouted(
        tester,
        api: api,
        home: const SessionDetailScreen(sessionId: 's1'),
        size: const Size(400, 1600),
      );
      await tester.tap(find.byKey(const ValueKey('session-rsvp')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'This is a women-only session. You can join if your profile gender is female.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('the host sees everyone, publishes and cancels', (
      tester,
    ) async {
      final draft = _session(
        status: 'DRAFT',
        myRole: 'HOST',
        myStatus: 'ACCEPTED',
        groupId: null,
        participants: [
          {
            'userId': 'u-host',
            'displayName': 'Rafiq H.',
            'role': 'HOST',
            'status': 'ACCEPTED',
          },
          {
            'userId': 'u-2',
            'displayName': 'Salma K.',
            'role': 'PARTICIPANT',
            'status': 'INVITED',
          },
        ],
      );
      final api = FakeApi()
        ..on('GET /sessions/s1', FakeResponse.data(draft))
        ..on('POST /sessions/s1/publish', FakeResponse.data(draft))
        ..on('POST /sessions/s1/cancel', FakeResponse.data(draft));
      await pumpRouted(
        tester,
        api: api,
        home: const SessionDetailScreen(sessionId: 's1'),
        size: const Size(400, 2000),
      );
      expect(find.text('Salma K.'), findsOneWidget);
      expect(find.text('Invited'), findsOneWidget);
      expect(find.byKey(const ValueKey('session-report')), findsNothing);
      expect(find.byKey(const ValueKey('session-invite')), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('session-publish')));
      await tester.pumpAndSettle();
      expect(api.called('POST /sessions/s1/publish'), hasLength(1));

      await tester.tap(find.byKey(const ValueKey('session-cancel')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('dialog-text')),
        'Rain all day',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('dialog-confirm')));
      await tester.pumpAndSettle();
      expect(api.called('POST /sessions/s1/cancel').single.data, {
        'reason': 'Rain all day',
      });
    });

    testWidgets('the expert confirms an online consultation with a price', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /sessions/s1',
          FakeResponse.data(
            _session(
              kind: 'CONSULTATION',
              status: 'DRAFT',
              mode: 'ONLINE',
              myRole: 'HOST',
              myStatus: 'INVITED',
              groupId: null,
            ),
          ),
        )
        ..on(
          'POST /sessions/s1/respond',
          FakeResponse.data(_session(kind: 'CONSULTATION', groupId: null)),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const SessionDetailScreen(sessionId: 's1'),
        size: const Size(400, 1600),
      );
      await tester.tap(find.byKey(const ValueKey('session-expert-accept')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('expert-link')),
        'https://meet.example.org/abc',
      );
      await tester.tap(find.text('In cash'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('expert-amount')),
        '300',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('expert-confirm')));
      await tester.pumpAndSettle();
      expect(api.called('POST /sessions/s1/respond').single.data, {
        'accept': true,
        'onlineLink': 'https://meet.example.org/abc',
        'priceModel': 'CASH',
        'pricePoisha': '30000',
      });
    });

    testWidgets('an attendee gives feedback after completion (Bangla)', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /sessions/s1',
          FakeResponse.data(
            _session(
              status: 'COMPLETED',
              myStatus: 'ATTENDED',
              startsAt: DateTime.now().subtract(const Duration(days: 1)),
            ),
          ),
        )
        ..on(
          'GET /reviews/subject',
          FakeResponse.data({
            'canReview': true,
            'revealed': true,
            'windowEndsAt': DateTime.now()
                .add(const Duration(days: 6))
                .toUtc()
                .toIso8601String(),
            'myReview': null,
            'receivedReviews': [],
          }),
        )
        ..on('POST /reviews', FakeResponse.data({'submitted': true}));
      await pumpRouted(
        tester,
        api: api,
        home: const SessionDetailScreen(sessionId: 's1'),
        locale: const Locale('bn'),
        size: const Size(400, 1800),
      );
      expect(find.text('শেষ হয়েছে'), findsOneWidget);
      expect(api.called('GET /reviews/subject').single.query, {
        'subjectType': 'SESSION',
        'subjectId': 's1',
      });
      await tester.tap(find.byKey(const ValueKey('session-feedback')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(FilledButton),
        ),
      );
      await tester.pumpAndSettle();
      final body = api.called('POST /reviews').single.data! as Map;
      expect(body['subjectType'], 'SESSION');
      expect(body['subjectId'], 's1');
      expect(body['rating'], 5);
    });
  });

  for (final (status, chat) in [('DRAFT', false), ('SCHEDULED', true)]) {
    testWidgets('consultation chat waits for the expert ($status)', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /sessions/s1',
          FakeResponse.data(
            _session(
              kind: 'CONSULTATION',
              status: status,
              mode: 'IN_APP_CHAT',
              myStatus: 'ACCEPTED',
              groupId: null,
            ),
          ),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const SessionDetailScreen(sessionId: 's1'),
        size: const Size(400, 1800),
      );
      expect(
        find.byKey(const ValueKey('session-chat')),
        chat ? findsOneWidget : findsNothing,
      );
      expect(
        find.byKey(const ValueKey('session-chat-pending')),
        chat ? findsNothing : findsOneWidget,
      );
    });
  }
}

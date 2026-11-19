import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/community/presentation/introduction_screens.dart';
import 'package:kaaj/features/explore/explore_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _intro({
  String id = 'i1',
  String role = 'EXPERT',
  String status = 'PENDING',
  bool allowIdeaAccess = false,
  List<String>? actions,
  String? conversationId,
}) => {
  'id': id,
  'status': status,
  'role': role,
  'requester': {
    'userId': 'u-req',
    'displayName': 'Salma K.',
    'trustLevel': 'PHONE',
  },
  'expert': {
    'userId': 'u-exp',
    'displayName': 'Rafiq H.',
    'trustLevel': 'IDENTITY',
    'bio': 'Tailoring for 12 years.',
  },
  'context': {
    'type': allowIdeaAccess ? 'IDEA' : 'LEARNING_GOAL',
    'id': null,
    'summary': 'Start a tailoring shop',
  },
  'message': 'Please guide me with my plan.',
  'allowIdeaAccess': allowIdeaAccess,
  'ideaAccessGranted': false,
  'conversationId': conversationId,
  'allowedActions':
      actions ??
      (status == 'PENDING'
          ? (role == 'EXPERT' ? ['ACCEPT', 'DECLINE'] : ['WITHDRAW'])
          : <String>[]),
  'expiresAt': '2026-11-27T10:00:00.000Z',
  'decidedAt': null,
  'declineReason': null,
  'createdAt': '2026-11-20T10:00:00.000Z',
  'futureField': {'ignored': true},
};

Map<String, dynamic> _mentor(String id, String name) => {
  'id': id,
  'displayName': name,
  'trustLevel': 'IDENTITY',
  'bio': 'I teach step by step.',
  'yearsExperience': 9,
  'area': {'nameEn': 'Kazla', 'nameBn': 'কাজলা'},
  'skills': <Object>[],
};

void main() {
  group('send an introduction', () {
    testWidgets('a learning goal request is sent and opens its page', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'POST /introductions',
          FakeResponse.data(_intro(role: 'REQUESTER')),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const SendIntroductionScreen(
          expertUserId: 'u-exp',
          expertName: 'Rafiq H.',
        ),
        size: const Size(400, 1600),
      );
      expect(find.text('Rafiq H.'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('intro-send')));
      await tester.pumpAndSettle();
      expect(api.called('POST /introductions'), isEmpty);
      expect(find.text('Write between 10 and 300 characters.'), findsOneWidget);

      await tester.enterText(
        find.byKey(const ValueKey('intro-goal')),
        'Learn to keep accounts for my shop',
      );
      await tester.enterText(
        find.byKey(const ValueKey('intro-message')),
        'I sew at home and want to grow.',
      );
      await tester.tap(find.byKey(const ValueKey('intro-send')));
      await tester.pumpAndSettle();

      expect(api.called('POST /introductions').single.data, {
        'expertUserId': 'u-exp',
        'contextType': 'LEARNING_GOAL',
        'learningGoal': 'Learn to keep accounts for my shop',
        'message': 'I sew at home and want to grow.',
      });
      expect(find.text('route:/introductions/i1'), findsOneWidget);
    });

    testWidgets('an owned idea can offer access; refusals are explained', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /me/ideas',
          FakeResponse.data({
            'owned': [
              {'id': 'idea-1', 'title': 'Home bakery'},
            ],
            'team': [
              {'id': 'idea-2', 'title': 'Rickshaw repair'},
            ],
          }),
        )
        ..on(
          'POST /introductions',
          FakeResponse.error(409, 'INTRODUCTION_ALREADY_PENDING'),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const SendIntroductionScreen(expertUserId: 'u-exp'),
        size: const Size(400, 1800),
      );
      await tester.tap(find.byKey(const ValueKey('intro-context-IDEA')));
      await tester.pumpAndSettle();
      expect(find.text('Home bakery'), findsOneWidget);
      expect(find.text('You are on the team'), findsOneWidget);

      // A team idea cannot offer access.
      await tester.tap(find.text('Rickshaw repair'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('intro-idea-access')), findsNothing);

      await tester.tap(find.text('Home bakery'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('intro-idea-access')));
      await tester.enterText(
        find.byKey(const ValueKey('intro-message')),
        'Could you look at my bakery plan?',
      );
      await tester.tap(find.byKey(const ValueKey('intro-send')));
      await tester.pumpAndSettle();

      expect(api.called('POST /introductions').single.data, {
        'expertUserId': 'u-exp',
        'contextType': 'IDEA',
        'contextId': 'idea-1',
        'message': 'Could you look at my bakery plan?',
        'allowIdeaAccess': true,
      });
      expect(
        find.text('You already have a pending request to this expert.'),
        findsOneWidget,
      );

      api.on('POST /introductions', FakeResponse.error(429, 'RATE_LIMITED'));
      await tester.tap(find.byKey(const ValueKey('intro-send')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'You can send 5 introduction requests a day. Try again later.',
        ),
        findsOneWidget,
      );
    });
  });

  group('introductions list', () {
    testWidgets('received and sent, with paging and an empty box', (
      tester,
    ) async {
      final api = FakeApi()
        ..onRequest('GET /introductions', (request) {
          if (request.query['box'] == 'sent') {
            return FakeResponse.data({'items': [], 'nextCursor': null});
          }
          if (request.query['cursor'] == 'i1') {
            return FakeResponse.data({
              'items': [_intro(id: 'i2', status: 'ACCEPTED')],
              'nextCursor': null,
            });
          }
          return FakeResponse.data({
            'items': [_intro()],
            'nextCursor': 'i1',
          });
        });
      await pumpRouted(tester, api: api, home: const IntroductionsScreen());
      expect(find.text('Salma K.'), findsOneWidget);
      expect(find.text('Waiting for an answer'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('intro-received-more')));
      await tester.pumpAndSettle();
      expect(find.text('Accepted'), findsOneWidget);
      expect(find.byKey(const ValueKey('intro-received-more')), findsNothing);

      await tester.tap(find.byKey(const ValueKey('intro-sent')));
      await tester.pumpAndSettle();
      expect(find.text('You have not sent any requests'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('intro-received')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('intro-i1')));
      await tester.pumpAndSettle();
      expect(find.text('route:/introductions/i1'), findsOneWidget);
    });

    testWidgets('a load error offers a retry', (tester) async {
      final api = FakeApi()
        ..on('GET /introductions', FakeResponse.error(500, 'INTERNAL'));
      await pumpRouted(tester, api: api, home: const IntroductionsScreen());
      expect(find.text('Could not load the requests.'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    });
  });

  group('introduction detail', () {
    testWidgets('the expert accepts with confidentiality and can chat', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /introductions/i1',
          FakeResponse.data(_intro(allowIdeaAccess: true)),
        )
        ..on(
          'POST /introductions/i1/accept',
          FakeResponse.data(_intro(status: 'ACCEPTED', conversationId: 'c1')),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const IntroductionDetailScreen(introductionId: 'i1'),
        size: const Size(400, 1600),
      );
      expect(find.text('Salma K.'), findsOneWidget);
      expect(find.text('Start a tailoring shop'), findsOneWidget);
      expect(find.byKey(const ValueKey('intro-decline')), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('intro-confidentiality')));
      api.on(
        'GET /introductions/i1',
        FakeResponse.data(
          _intro(
            status: 'ACCEPTED',
            conversationId: 'c1',
            allowIdeaAccess: true,
          ),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('intro-accept')));
      await tester.pumpAndSettle();

      expect(api.called('POST /introductions/i1/accept').single.data, {
        'acceptConfidentiality': true,
      });
      expect(find.byKey(const ValueKey('intro-accept')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('intro-chat')));
      await tester.pumpAndSettle();
      expect(find.text('route:/conversations/c1'), findsOneWidget);
    });

    testWidgets('the requester withdraws; a refusal shows its copy', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /introductions/i1',
          FakeResponse.data(_intro(role: 'REQUESTER')),
        )
        ..on(
          'POST /introductions/i1/withdraw',
          FakeResponse.error(409, 'INTRODUCTION_TRANSITION_NOT_ALLOWED'),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const IntroductionDetailScreen(introductionId: 'i1'),
        size: const Size(400, 1600),
      );
      expect(find.text('Rafiq H.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('intro-withdraw')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('confirm-action')));
      await tester.pumpAndSettle();
      expect(api.called('POST /introductions/i1/withdraw'), hasLength(1));
      expect(
        find.textContaining("That step isn't possible now"),
        findsOneWidget,
      );
    });

    testWidgets('a hidden introduction shows the not available state', (
      tester,
    ) async {
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: const IntroductionDetailScreen(introductionId: 'gone'),
      );
      expect(find.text('This is not available'), findsOneWidget);
    });

    testWidgets('renders in Bangla and declines with a reason', (tester) async {
      final api = FakeApi()
        ..on('GET /introductions/i1', FakeResponse.data(_intro()))
        ..on(
          'POST /introductions/i1/decline',
          FakeResponse.data(_intro(status: 'DECLINED')),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const IntroductionDetailScreen(introductionId: 'i1'),
        locale: const Locale('bn'),
        size: const Size(400, 1600),
      );
      expect(find.text('উত্তরের অপেক্ষায়'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('intro-decline')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('dialog-text')),
        'এখন সময় নেই',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('dialog-confirm')));
      await tester.pumpAndSettle();
      expect(api.called('POST /introductions/i1/decline').single.data, {
        'reason': 'এখন সময় নেই',
      });
    });
  });

  testWidgets('a mentor card asks for an introduction or a consultation', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET /users/workers', FakeResponse.data({'items': []}))
      ..on(
        'GET /mentors',
        FakeResponse.data({
          'items': [_mentor('m1', 'Rafiq H.')],
          'nextCursor': null,
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const ExploreScreen(initial: ExploreSection.people),
      size: const Size(400, 1400),
      overrides: [meAs(KaajRole.worker)],
    );
    await tester.tap(find.text('Mentor'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('mentor-introduce-m1')));
    await tester.pumpAndSettle();
    expect(
      find.text('route:/experts/m1/introduce?name=Rafiq+H.'),
      findsOneWidget,
    );
  });
}

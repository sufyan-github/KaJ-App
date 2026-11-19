import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/ideas/presentation/idea_detail_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _role({String id = 'role-1', String status = 'OPEN'}) => {
  'id': id,
  'roleType': 'TECHNICAL',
  'roleLabel': {'en': 'Technical partner', 'bn': 'কারিগরি অংশীদার'},
  'title': 'App builder',
  'description': 'Builds the booking app.',
  'timeCommitment': 'PART_TIME',
  'arrangement': 'EQUITY_TO_DISCUSS',
  'status': status,
  'skills': [
    {'id': 'skill-1', 'nameEn': 'Flutter', 'nameBn': 'ফ্লাটার'},
  ],
};

Map<String, dynamic> _idea({
  String? relation,
  bool canView = false,
  Map<String, dynamic>? myAccess,
  Map<String, dynamic>? extra,
}) => {
  'id': 'idea-1',
  'title': 'Solar dryer for mangoes',
  'summary': 'Dry mangoes with the sun to sell all year.',
  'category': {'id': 'sec-1', 'nameEn': 'Agriculture', 'nameBn': 'কৃষি'},
  'area': {'id': 'area-1', 'nameEn': 'Boalia', 'nameBn': 'বোয়ালিয়া'},
  'stage': 'VALIDATING',
  'stageLabel': {'en': 'Validating', 'bn': 'যাচাই চলছে'},
  'owner': {
    'userId': 'owner-1',
    'displayName': 'Karim H.',
    'identityVerified': true,
  },
  'roles': [_role()],
  'teamSize': 2,
  'myRelation': relation,
  'canViewDetails': canView,
  if (relation == null) 'myAccess': myAccess,
  if (canView)
    'details': {
      'problem': 'Mangoes rot in the season.',
      'solution': 'A cheap solar dryer in each village.',
      'details': 'Pilot in Boalia with ten farmers.',
    },
  if (canView && relation != 'OWNER')
    'notice': {
      'key': 'idea.notice.confidentiality',
      'en': 'Confidential: do not share or use without the owner.',
      'bn': 'গোপনীয়: মালিকের অনুমতি ছাড়া শেয়ার বা ব্যবহার করবেন না।',
    },
  ...?extra,
};

Future<void> _tapKey(WidgetTester tester, String key) async {
  await tester.ensureVisible(find.byKey(ValueKey(key)));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(ValueKey(key)));
  await tester.pumpAndSettle();
}

void main() {
  group('as an outsider', () {
    testWidgets('requests access only after accepting confidentiality', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /ideas/idea-1', FakeResponse.data(_idea()))
        ..on(
          'POST /ideas/idea-1/access-requests',
          FakeResponse.data({
            'ideaId': 'idea-1',
            'status': 'REQUESTED',
            'requestedAt': '2026-11-20T04:00:00Z',
          }, status: 201),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const IdeaDetailScreen(ideaId: 'idea-1'),
        size: const Size(400, 2400),
      );
      expect(find.text('Solar dryer for mangoes'), findsOneWidget);
      expect(find.text('Private details'), findsOneWidget);
      expect(find.text('Mangoes rot in the season.'), findsNothing);
      expect(find.byKey(const ValueKey('idea-report')), findsOneWidget);

      await _tapKey(tester, 'idea-request-access');
      final send = find.byKey(const ValueKey('idea-access-send'));
      expect(tester.widget<FilledButton>(send).onPressed, isNull);
      await tester.enterText(
        find.byKey(const ValueKey('idea-access-message')),
        'I run a dryer shop.',
      );
      await tester.tap(
        find.byKey(const ValueKey('idea-accept-confidentiality')),
      );
      await tester.pump();
      expect(tester.widget<FilledButton>(send).onPressed, isNotNull);

      api.on(
        'GET /ideas/idea-1',
        FakeResponse.data(
          _idea(
            myAccess: {
              'status': 'REQUESTED',
              'requestedAt': '2026-11-20T04:00:00Z',
            },
          ),
        ),
      );
      await tester.tap(send);
      await tester.pumpAndSettle();
      expect(api.called('POST /ideas/idea-1/access-requests').single.data, {
        'acceptConfidentiality': true,
        'message': 'I run a dryer shop.',
      });
      expect(find.text('Request sent to the owner.'), findsOneWidget);
      expect(find.text('Waiting for approval'), findsOneWidget);
      expect(find.byKey(const ValueKey('idea-request-access')), findsNothing);
    });

    testWidgets('a refused access request shows the server reason inline', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /ideas/idea-1', FakeResponse.data(_idea()))
        ..on(
          'POST /ideas/idea-1/access-requests',
          FakeResponse.error(409, 'IDEA_ACCESS_ALREADY_REQUESTED'),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const IdeaDetailScreen(ideaId: 'idea-1'),
        size: const Size(400, 2400),
      );
      await _tapKey(tester, 'idea-request-access');
      await tester.tap(
        find.byKey(const ValueKey('idea-accept-confidentiality')),
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('idea-access-send')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('idea-access-error')), findsOneWidget);
      expect(find.text('Request sent to the owner.'), findsNothing);
    });

    testWidgets('shows interest in a role with the collaboration notice', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /ideas/idea-1', FakeResponse.data(_idea()))
        ..onRequest(
          'POST /collaboration-requests',
          (_) => FakeResponse.error(409, 'IDEA_ROLE_NOT_OPEN'),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const IdeaDetailScreen(ideaId: 'idea-1'),
        size: const Size(400, 2400),
      );
      expect(find.text('Technical partner'), findsOneWidget);
      expect(find.text('App builder'), findsOneWidget);
      await _tapKey(tester, 'idea-interest-role-1');
      expect(
        find.byKey(const ValueKey('idea-collaboration-notice')),
        findsOneWidget,
      );
      expect(find.textContaining('not a legal partnership'), findsOneWidget);

      // Too short: nothing is sent.
      await tester.enterText(
        find.byKey(const ValueKey('idea-interest-message')),
        'Hi',
      );
      await tester.tap(find.byKey(const ValueKey('idea-interest-send')));
      await tester.pumpAndSettle();
      expect(api.called('POST /collaboration-requests'), isEmpty);
      expect(
        find.text('The message must be 10 to 1000 characters.'),
        findsOneWidget,
      );

      // A refusal from the server.
      await tester.enterText(
        find.byKey(const ValueKey('idea-interest-message')),
        'I build Flutter apps and can help part time.',
      );
      await tester.tap(find.byKey(const ValueKey('idea-interest-send')));
      await tester.pumpAndSettle();
      expect(find.text('This role is no longer open.'), findsOneWidget);

      api.on(
        'POST /collaboration-requests',
        FakeResponse.data({
          'id': 'collab-1',
          'status': 'PROPOSED',
          'subject': {'type': 'IDEA', 'id': 'idea-1', 'ideaRoleId': 'role-1'},
        }, status: 201),
      );
      await tester.tap(find.byKey(const ValueKey('idea-interest-send')));
      await tester.pumpAndSettle();
      expect(api.called('POST /collaboration-requests').last.data, {
        'subjectType': 'IDEA',
        'subjectId': 'idea-1',
        'ideaRoleId': 'role-1',
        'message': 'I build Flutter apps and can help part time.',
      });
      expect(find.text('Your interest was sent to the owner.'), findsOneWidget);
      await tester.tap(find.text('View the request'));
      await tester.pumpAndSettle();
      expect(
        find.text('route:/collaboration-requests/collab-1'),
        findsOneWidget,
      );
    });

    testWidgets('a hidden or private idea is not available', (tester) async {
      final api = FakeApi()
        ..on('GET /ideas/idea-1', FakeResponse.error(404, 'NOT_FOUND'));
      await pumpRouted(
        tester,
        api: api,
        home: const IdeaDetailScreen(ideaId: 'idea-1'),
      );
      expect(find.text('This idea is not available'), findsOneWidget);
    });
  });

  testWidgets('access holder reads the details with the notice (bn)', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /ideas/idea-1',
        FakeResponse.data(_idea(relation: 'ACCESS', canView: true)),
      );
    await pumpRouted(
      tester,
      api: api,
      locale: const Locale('bn'),
      home: const IdeaDetailScreen(ideaId: 'idea-1'),
      size: const Size(400, 2400),
    );
    expect(find.byKey(const ValueKey('idea-notice')), findsOneWidget);
    expect(
      find.text('গোপনীয়: মালিকের অনুমতি ছাড়া শেয়ার বা ব্যবহার করবেন না।'),
      findsOneWidget,
    );
    expect(find.text('Mangoes rot in the season.'), findsOneWidget);
    expect(find.text('A cheap solar dryer in each village.'), findsOneWidget);
    expect(find.text('Pilot in Boalia with ten farmers.'), findsOneWidget);
    expect(find.text('যাচাই চলছে'), findsOneWidget);
    expect(find.byKey(const ValueKey('idea-access-card')), findsNothing);
  });

  testWidgets('team member opens the room and leaves the team', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /ideas/idea-1',
        FakeResponse.data(_idea(relation: 'MEMBER', canView: true)),
      )
      ..on(
        'POST /ideas/idea-1/room',
        FakeResponse.data({'ideaId': 'idea-1', 'conversationId': 'conv-9'}),
      )
      ..on(
        'DELETE /ideas/idea-1/members/user-1',
        FakeResponse.data({
          'ideaId': 'idea-1',
          'userId': 'user-1',
          'removed': true,
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const IdeaDetailScreen(ideaId: 'idea-1'),
      size: const Size(400, 2400),
      overrides: [meAs(KaajRole.worker)],
    );
    expect(find.byKey(const ValueKey('idea-interest-role-1')), findsNothing);

    await _tapKey(tester, 'idea-leave');
    expect(find.text('Leave the team?'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('idea-confirm')));
    await tester.pumpAndSettle();
    expect(api.called('DELETE /ideas/idea-1/members/user-1'), hasLength(1));
    expect(find.text('You left the team.'), findsOneWidget);

    await _tapKey(tester, 'idea-room');
    expect(api.called('POST /ideas/idea-1/room'), hasLength(1));
    expect(find.text('route:/conversations/conv-9'), findsOneWidget);
  });
}

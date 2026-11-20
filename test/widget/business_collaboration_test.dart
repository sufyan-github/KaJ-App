import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/business/presentation/collaboration_screens.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

const _notice = {
  'key': 'collaboration.notice.not_legal_partnership',
  'en': 'KAAJ only connects people. Put any agreement in writing yourselves.',
  'bn': 'KAAJ শুধু মানুষকে যুক্ত করে। যেকোনো চুক্তি নিজেরা লিখিতভাবে করুন।',
};

Map<String, dynamic> _request(
  String id, {
  String status = 'PROPOSED',
  String role = 'RECIPIENT',
  List<String> actions = const ['ACCEPT', 'DECLINE'],
  String subjectType = 'BUSINESS',
  String? conversationId,
  bool agreedByThem = false,
  String? summary,
}) => {
  'id': id,
  'status': status,
  'role': role,
  'subject': {
    'type': subjectType,
    'id': subjectType == 'IDEA' ? 'idea-1' : 'b-1',
    'ideaRoleId': subjectType == 'IDEA' ? 'role-1' : null,
    'title': subjectType == 'IDEA' ? 'Solar dryer' : 'Rahim Agro',
    'summary': subjectType == 'IDEA' ? 'Dry mangoes with sunlight' : null,
  },
  'requester': {'userId': 'u-2', 'displayName': 'K***'},
  'recipient': {'userId': 'user-1', 'displayName': 'Rahim'},
  'fromBusiness': {'id': 'b-9', 'name': 'Karim Foods'},
  'message': 'We would like to supply packaging for your vegetables.',
  'conversationId': conversationId,
  'agreement': {
    'summary': summary,
    'agreedByMe': false,
    'agreedByThem': agreedByThem,
    'agreedAt': null,
  },
  'allowedActions': actions,
  'createdAt': '2026-11-15T10:00:00Z',
  'notice': _notice,
  'history': [
    {
      'fromStatus': null,
      'toStatus': 'PROPOSED',
      'by': 'THEM',
      'note': null,
      'at': '2026-11-15T10:00:00Z',
    },
  ],
};

Future<void> _open(
  WidgetTester tester,
  FakeApi api,
  Widget home, {
  Locale locale = const Locale('en'),
}) => pumpRouted(
  tester,
  api: api,
  home: home,
  locale: locale,
  size: const Size(400, 1800),
  overrides: [meAs(KaajRole.worker)],
);

void main() {
  testWidgets('lists received and sent requests with paging', (tester) async {
    final api = FakeApi()
      ..onRequest('GET /collaboration-requests', (request) {
        if (request.query['box'] == 'sent') {
          return FakeResponse.data({
            'notice': _notice,
            'items': [_request('c-9', role: 'REQUESTER', actions: [])],
          });
        }
        if (request.query['cursor'] == 'next') {
          return FakeResponse.data({
            'notice': _notice,
            'items': [_request('c-2', status: 'DECLINED', actions: [])],
          });
        }
        return FakeResponse.data({
          'notice': _notice,
          'items': [_request('c-1')],
          'nextCursor': 'next',
        });
      });
    await _open(tester, api, const CollaborationListScreen());
    expect(find.text(_notice['en']!), findsOneWidget);
    expect(find.byKey(const ValueKey('collaboration-c-1')), findsOneWidget);
    expect(find.text('Proposed'), findsOneWidget);
    expect(api.called('GET /collaboration-requests').first.query, {
      'box': 'received',
    });

    await tester.tap(
      find.byKey(const ValueKey('collaboration-load-more-received')),
    );
    await tester.pumpAndSettle();
    expect(api.called('GET /collaboration-requests').last.query, {
      'box': 'received',
      'cursor': 'next',
    });
    expect(find.text('Declined'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('collaboration-tab-sent')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('collaboration-c-9')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('collaboration-c-9')));
    await tester.pumpAndSettle();
    expect(find.text('route:/collaboration-requests/c-9'), findsOneWidget);
  });

  testWidgets('the recipient accepts with a note', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /collaboration-requests/c-1',
        FakeResponse.data(_request('c-1')),
      )
      ..on(
        'POST /collaboration-requests/c-1/accept',
        FakeResponse.data(_request('c-1', status: 'ACCEPTED')),
      );
    await _open(tester, api, const CollaborationDetailScreen(requestId: 'c-1'));
    expect(find.byKey(const ValueKey('collaboration-notice')), findsOneWidget);
    expect(find.text('K***'), findsOneWidget);
    expect(find.text('Karim Foods'), findsOneWidget);
    expect(find.byKey(const ValueKey('collaboration-chat')), findsNothing);

    api.on(
      'GET /collaboration-requests/c-1',
      FakeResponse.data(
        _request(
          'c-1',
          status: 'ACCEPTED',
          actions: ['AGREE', 'WITHDRAW'],
          conversationId: 'conv-1',
        ),
      ),
    );
    await tester.tap(find.byKey(const ValueKey('collaboration-action-ACCEPT')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('collaboration-note')),
      'Happy to talk',
    );
    await tester.tap(find.byKey(const ValueKey('collaboration-confirm')));
    await tester.pumpAndSettle();
    expect(api.called('POST /collaboration-requests/c-1/accept').single.data, {
      'note': 'Happy to talk',
    });
    expect(
      find.byKey(const ValueKey('collaboration-action-AGREE')),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const ValueKey('collaboration-chat')));
    await tester.pumpAndSettle();
    expect(find.text('route:/conversations/conv-1'), findsOneWidget);
  });

  testWidgets('agree sends the summary; a refusal shows in the dialog', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /collaboration-requests/c-1',
        FakeResponse.data(
          _request(
            'c-1',
            status: 'ACCEPTED',
            actions: ['AGREE', 'WITHDRAW'],
            conversationId: 'conv-1',
            agreedByThem: true,
            summary: 'Packaging at cost for 3 months',
          ),
        ),
      )
      ..on(
        'POST /collaboration-requests/c-1/agree',
        FakeResponse.error(
          409,
          'COLLABORATION_TRANSITION_NOT_ALLOWED',
          details: [
            {
              'allowedActions': ['WITHDRAW'],
            },
          ],
        ),
      );
    await _open(tester, api, const CollaborationDetailScreen(requestId: 'c-1'));
    expect(find.text('Packaging at cost for 3 months'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('collaboration-action-AGREE')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('collaboration-confirm')));
    await tester.pumpAndSettle();
    expect(api.called('POST /collaboration-requests/c-1/agree').single.data, {
      'summary': 'Packaging at cost for 3 months',
    });
    expect(find.text("That step isn't possible now."), findsOneWidget);
    expect(find.byKey(const ValueKey('collaboration-confirm')), findsOneWidget);
  });

  testWidgets('an idea request shows the subject and the notice in bn', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /collaboration-requests/c-5',
        FakeResponse.data(
          _request(
            'c-5',
            subjectType: 'IDEA',
            role: 'REQUESTER',
            actions: ['WITHDRAW'],
          ),
        ),
      );
    await _open(
      tester,
      api,
      const CollaborationDetailScreen(requestId: 'c-5'),
      locale: const Locale('bn'),
    );
    expect(find.text(_notice['bn']!), findsOneWidget);
    expect(find.text('Solar dryer'), findsOneWidget);
    expect(find.text('Dry mangoes with sunlight'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('collaboration-idea-role')),
      findsOneWidget,
    );
    expect(find.text('প্রত্যাহার করুন'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('collaboration-report')));
    await tester.pumpAndSettle();
    expect(
      find.text('route:/report/COLLABORATION_REQUEST/c-5'),
      findsOneWidget,
    );
  });

  testWidgets('a hidden request is not available but keeps the notice', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /collaboration-requests/c-1',
        FakeResponse.error(404, 'NOT_FOUND'),
      );
    await _open(tester, api, const CollaborationDetailScreen(requestId: 'c-1'));
    expect(find.text('Not available'), findsOneWidget);
    expect(find.byKey(const ValueKey('collaboration-notice')), findsOneWidget);
  });

  testWidgets('sends a request from one of my businesses', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /businesses/b-1',
        FakeResponse.data({
          'id': 'b-1',
          'name': 'Rahim Agro',
          'stage': 'INFORMAL',
          'myRole': null,
        }),
      )
      ..on(
        'GET /me/businesses',
        FakeResponse.data({
          'items': [
            {
              'id': 'b-9',
              'name': 'Karim Foods',
              'stage': 'INFORMAL',
              'myRole': 'MANAGER',
              'status': 'ACTIVE',
            },
            {
              'id': 'b-8',
              'name': 'Staff Only Shop',
              'stage': 'INFORMAL',
              'myRole': 'STAFF',
              'status': 'ACTIVE',
            },
          ],
          'invitations': <Object>[],
        }),
      )
      ..on(
        'POST /collaboration-requests',
        FakeResponse.data(_request('c-new'), status: 201),
      );
    await _open(
      tester,
      api,
      const CollaborationRequestFormScreen(
        subjectType: 'BUSINESS',
        subjectId: 'b-1',
      ),
    );
    expect(find.text('Rahim Agro'), findsOneWidget);
    expect(find.byKey(const ValueKey('collaboration-notice')), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('collaboration-message')),
      'short',
    );
    await tester.tap(find.byKey(const ValueKey('collaboration-send')));
    await tester.pumpAndSettle();
    expect(api.called('POST /collaboration-requests'), isEmpty);

    await tester.enterText(
      find.byKey(const ValueKey('collaboration-message')),
      'We make packaging and want to work with you.',
    );
    await tester.tap(find.byKey(const ValueKey('collaboration-from-business')));
    await tester.pumpAndSettle();
    expect(find.text('Staff Only Shop'), findsNothing);
    await tester.tap(find.text('Karim Foods').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('collaboration-send')));
    await tester.pumpAndSettle();
    expect(api.called('POST /collaboration-requests').single.data, {
      'subjectType': 'BUSINESS',
      'subjectId': 'b-1',
      'message': 'We make packaging and want to work with you.',
      'fromBusinessId': 'b-9',
    });
    expect(find.text('route:/collaboration-requests/c-new'), findsOneWidget);
  });

  testWidgets('an open request already is explained with a link', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'POST /collaboration-requests',
        FakeResponse.error(409, 'COLLABORATION_ALREADY_OPEN'),
      );
    await _open(
      tester,
      api,
      const CollaborationRequestFormScreen(
        subjectType: 'BUSINESS',
        subjectId: 'b-1',
      ),
    );
    await tester.enterText(
      find.byKey(const ValueKey('collaboration-message')),
      'We make packaging and want to work with you.',
    );
    await tester.tap(find.byKey(const ValueKey('collaboration-send')));
    await tester.pumpAndSettle();
    expect(
      find.text('You already have an open request about this.'),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('collaboration-see-open')),
      findsOneWidget,
    );
  });
}

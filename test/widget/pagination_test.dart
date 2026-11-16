import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/core/config/app_environment.dart';
import 'package:kaaj/core/connectivity/connectivity_service.dart';
import 'package:kaaj/core/network/paged_list.dart';
import 'package:kaaj/core/storage/session_token_store.dart';
import 'package:kaaj/features/chat/data/chat_realtime_service.dart';
import 'package:kaaj/features/chat/data/chat_repository.dart';
import 'package:kaaj/features/chat/domain/chat_models.dart';
import 'package:kaaj/features/chat/presentation/controllers/chat_providers.dart';
import 'package:kaaj/features/chat/presentation/screens/chat_screens.dart';
import 'package:kaaj/features/jobs/presentation/screens/jobs_screens.dart';
import 'package:kaaj/features/notifications/presentation/screens/notifications_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

FakeResponse _page(List<Object> items, {String? next}) => FakeResponse(200, {
  'data': {'items': items},
  'meta': {'nextCursor': ?next},
});

Map<String, dynamic> _job(String id) => {
  'id': id,
  'title': 'Job $id',
  'description': 'Some work to do in the area.',
  'status': 'APPLICATIONS_OPEN',
  'category': {'id': 'cat-1', 'name_bn': 'মেরামত', 'name_en': 'Repairs'},
  'location': {'name_bn': 'বোয়ালিয়া', 'name_en': 'Boalia'},
  'skills': <Object>[],
};

Map<String, dynamic> _assignment(String id) => {
  'id': id,
  'title': 'Assignment $id',
  'status': 'CONFIRMED',
  'isWorker': true,
  'isPoster': false,
};

Map<String, dynamic> _notification(String id) => {
  'id': id,
  'type': 'SYSTEM',
  'title': 'Update $id',
  'body': 'Body $id',
  'createdAt': '2026-11-16T08:00:00Z',
  'readAt': '2026-11-16T09:00:00Z',
};

class _QuietRealtime extends ChatRealtimeService {
  _QuietRealtime()
    : super(
        const AppEnvironment(
          flavor: AppFlavor.dev,
          apiBaseUrl: 'https://kaaj.test/api/v1',
          sentryDsn: '',
        ),
        SessionTokenStore(const FlutterSecureStorage()),
      );

  @override
  Stream<ChatMessage> get messages => const Stream.empty();

  @override
  void connect(String conversationId) {}
}

class _Offline extends ConnectivityService {
  _Offline() : super(Connectivity(), probe: () async => false);

  @override
  Future<bool> isOnline() async => false;

  @override
  Stream<bool> get changes => const Stream.empty();
}

class _MemoryBox implements Box<dynamic> {
  @override
  dynamic get(dynamic key, {dynamic defaultValue}) => defaultValue;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('cursor parsing', () {
    test('reads the cursor wherever the API puts it', () {
      expect(
        PagedList.cursorFrom({
          'meta': {'nextCursor': 'a'},
        }),
        'a',
      );
      expect(
        PagedList.cursorFrom({
          'data': {'items': <Object>[], 'nextCursor': 'b'},
        }),
        'b',
      );
      expect(
        PagedList.cursorFrom({
          'meta': {
            'pagination': {'nextCursor': 'c'},
          },
        }),
        'c',
      );
      expect(PagedList.cursorFrom({'meta': <String, Object>{}}), isNull);
      expect(PagedList(const [1, 2]).hasMore, isFalse);
    });
  });

  testWidgets('the job feed loads the next page on request', (tester) async {
    final api = FakeApi()
      ..onRequest(
        'GET /jobs',
        (request) => request.query['cursor'] == 'c2'
            ? _page([_job('3')])
            : _page([_job('1'), _job('2')], next: 'c2'),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const JobFeedScreen(),
      size: const Size(400, 4000),
      overrides: [meAs(KaajRole.worker)],
    );
    expect(find.text('Job 3'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('load-more')));
    await tester.pumpAndSettle();

    expect(find.text('Job 1'), findsOneWidget);
    expect(find.text('Job 3'), findsOneWidget);
    expect(find.byKey(const ValueKey('load-more')), findsNothing);
    expect(api.called('GET /jobs').first.query.containsKey('cursor'), isFalse);
  });

  testWidgets('a server without pagination shows no load more', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /assignments',
        FakeResponse.data({
          'items': [_assignment('a')],
        }),
      );
    await pumpRouted(tester, api: api, home: const AssignmentsScreen());
    expect(find.text('Assignment a'), findsOneWidget);
    expect(find.byKey(const ValueKey('load-more')), findsNothing);
  });

  testWidgets('assignments load the next page', (tester) async {
    final api = FakeApi()
      ..onRequest(
        'GET /assignments',
        (request) => request.query['cursor'] == 'n'
            ? _page([_assignment('b')])
            : _page([_assignment('a')], next: 'n'),
      );
    await pumpRouted(tester, api: api, home: const AssignmentsScreen());
    await tester.tap(find.byKey(const ValueKey('load-more')));
    await tester.pumpAndSettle();
    expect(find.text('Assignment a'), findsOneWidget);
    expect(find.text('Assignment b'), findsOneWidget);
  });

  testWidgets('notifications load older pages', (tester) async {
    final api = FakeApi()
      ..onRequest(
        'GET /notifications',
        (request) => request.query['cursor'] == 'older'
            ? _page([_notification('2')])
            : _page([_notification('1')], next: 'older'),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const NotificationsScreen(),
      size: const Size(400, 3000),
    );
    await tester.tap(find.byKey(const ValueKey('load-more')));
    await tester.pumpAndSettle();
    expect(api.called('GET /notifications'), hasLength(2));
    expect(find.byKey(const ValueKey('load-more')), findsNothing);
  });

  testWidgets('chat loads earlier messages before the oldest one', (
    tester,
  ) async {
    Map<String, dynamic> message(int n) => {
      'id': 'm$n',
      'conversationId': 'conv-1',
      'isMine': false,
      'type': 'TEXT',
      'body': 'message $n',
      'createdAt': DateTime.utc(
        2026,
        11,
        16,
        8,
      ).add(Duration(minutes: n)).toIso8601String(),
    };
    final api = FakeApi()
      ..onRequest('GET /conversations/conv-1/messages', (request) {
        if (request.query['before'] == 'm100') {
          return FakeResponse.data({
            'items': [message(1)],
          });
        }
        return FakeResponse.data({
          'items': [for (var n = 100; n < 200; n++) message(n)],
        });
      })
      ..on('POST /conversations/conv-1/read', FakeResponse.data({}));
    await pumpRouted(
      tester,
      api: api,
      home: const ChatThreadScreen(conversationId: 'conv-1'),
      overrides: [
        chatRepositoryProvider.overrideWithValue(
          ChatRepository(api.dio(), _MemoryBox()),
        ),
        chatRealtimeProvider.overrideWith((ref) => _QuietRealtime()),
        connectivityServiceProvider.overrideWithValue(_Offline()),
      ],
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('chat-load-earlier')),
      -500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const ValueKey('chat-load-earlier')));
    await tester.pumpAndSettle();

    final calls = api.called('GET /conversations/conv-1/messages');
    expect(calls.last.query['before'], 'm100');
    expect(find.byKey(const ValueKey('chat-load-earlier')), findsNothing);
    await tester.scrollUntilVisible(
      find.text('message 1'),
      -500,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('message 1'), findsOneWidget);
  });
}

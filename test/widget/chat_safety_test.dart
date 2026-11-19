import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/core/config/app_environment.dart';
import 'package:kaaj/core/connectivity/connectivity_service.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/security/secure_screen.dart';
import 'package:kaaj/core/storage/session_token_store.dart';
import 'package:kaaj/features/chat/data/chat_realtime_service.dart';
import 'package:kaaj/features/chat/data/chat_repository.dart';
import 'package:kaaj/features/chat/domain/chat_models.dart';
import 'package:kaaj/features/chat/presentation/controllers/chat_providers.dart';
import 'package:kaaj/features/chat/presentation/screens/chat_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

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

  final _incoming = StreamController<ChatMessage>.broadcast();
  final _refusals = StreamController<Failure>.broadcast();

  @override
  Stream<ChatMessage> get messages => _incoming.stream;

  @override
  Stream<Failure> get errors => _refusals.stream;

  @override
  void connect(String conversationId) {}

  void refuse(Object? payload) =>
      _refusals.add(socketExceptionFailure(payload)!);
}

class _MemoryBox implements Box<dynamic> {
  final data = <dynamic, dynamic>{};

  @override
  dynamic get(dynamic key, {dynamic defaultValue}) => data[key] ?? defaultValue;

  @override
  Future<void> put(dynamic key, dynamic value) async => data[key] = value;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FixedConnectivity extends ConnectivityService {
  _FixedConnectivity() : super(Connectivity(), probe: () async => true);

  @override
  Future<bool> isOnline() async => true;

  @override
  Stream<bool> get changes => const Stream.empty();
}

Map<String, dynamic> _message(
  String id,
  String body, {
  String sender = 'other',
  String conversation = 'conv-1',
}) => {
  'id': id,
  'conversationId': conversation,
  'senderUserId': sender,
  'isMine': false,
  'type': 'TEXT',
  'body': body,
  'createdAt': '2026-11-16T08:00:00Z',
};

void main() {
  late _MemoryBox box;
  late _QuietRealtime realtime;

  setUp(() {
    box = _MemoryBox();
    realtime = _QuietRealtime();
  });

  Future<void> pumpThread(
    WidgetTester tester,
    FakeApi api, {
    String id = 'conv-1',
    Widget? home,
    String lang = 'en',
  }) => pumpRouted(
    tester,
    api: api,
    home: home ?? ChatThreadScreen(conversationId: id),
    locale: Locale(lang),
    overrides: [
      chatRepositoryProvider.overrideWithValue(ChatRepository(api.dio(), box)),
      chatRealtimeProvider.overrideWith((ref) => realtime),
      connectivityServiceProvider.overrideWithValue(_FixedConnectivity()),
    ],
  );

  FakeApi directApi() => FakeApi()
    ..on(
      'GET /conversations',
      FakeResponse.data({
        'items': [
          {
            'id': 'conv-1',
            'kind': 'DIRECT',
            'jobTitle': 'Fix the tap',
            'otherName': 'Karim',
            'otherUserId': 'other',
            'unreadCount': 0,
            'updatedAt': '2026-11-16T08:00:00Z',
          },
        ],
      }),
    )
    ..on(
      'GET /conversations/conv-1/messages',
      FakeResponse.data({
        'items': [_message('m-1', 'When will you come?')],
      }),
    )
    ..on('POST /conversations/conv-1/read', FakeResponse.data({}));

  testWidgets('a message refused for good is not queued or re-sent', (
    tester,
  ) async {
    final api = directApi()
      ..on(
        'POST /conversations/conv-1/messages',
        FakeResponse.error(409, 'USER_BLOCKED'),
      );
    await pumpThread(tester, api);
    await tester.enterText(find.byType(TextField), 'Are you there?');
    await tester.tap(find.byTooltip('Send'));
    await tester.pumpAndSettle();

    expect(box.get('pending:conv-1'), isEmpty);
    expect(find.byKey(const ValueKey('delivery-refused')), findsOneWidget);
    expect(find.byKey(const ValueKey('delivery-failed')), findsNothing);
    expect(api.called('POST /conversations/conv-1/messages'), hasLength(1));
  });

  testWidgets('a server fault keeps the message queued for a retry', (
    tester,
  ) async {
    final api = directApi()
      ..on(
        'POST /conversations/conv-1/messages',
        FakeResponse.error(503, 'SERVICE_UNAVAILABLE'),
      );
    await pumpThread(tester, api);
    await tester.enterText(find.byType(TextField), 'Are you there?');
    await tester.tap(find.byTooltip('Send'));
    await tester.pumpAndSettle();
    expect(box.get('pending:conv-1'), hasLength(1));
    expect(find.byKey(const ValueKey('delivery-failed')), findsOneWidget);
  });

  testWidgets('a failed read receipt still shows the thread', (tester) async {
    final api = directApi()
      ..on('POST /conversations/conv-1/read', FakeResponse.error(500, 'X'));
    await pumpThread(tester, api);
    expect(find.text('When will you come?'), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-error')), findsNothing);
  });

  testWidgets('a socket refusal is explained and can be dismissed (bn)', (
    tester,
  ) async {
    await pumpThread(tester, directApi(), lang: 'bn');
    realtime.refuse({
      'code': 'ACCOUNT_RESTRICTED',
      'message': 'Marketplace actions are temporarily restricted.',
      'httpStatus': 403,
    });
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('chat-error')), findsOneWidget);
    expect(find.textContaining('সাময়িকভাবে সীমিত'), findsOneWidget);
    await tester.tap(find.text('ঠিক আছে'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('chat-error')), findsNothing);
  });

  test('socket exception payloads', () {
    expect(
      socketExceptionFailure({'status': 'error', 'message': 'Unauthorized.'}),
      isNull,
    );
    final failure = socketExceptionFailure({
      'code': 'NOT_FOUND',
      'message': 'Not found',
      'httpStatus': 404,
    })!;
    expect(failure.kind, FailureKind.notFound);
    expect(failure.code, 'NOT_FOUND');
    expect(
      socketExceptionFailure({'code': 'VALIDATION_FAILED'})!.code,
      'VALIDATION_FAILED',
    );
    expect(ChatThreadController.isPermanentRefusal(failure), isTrue);
    expect(
      ChatThreadController.isPermanentRefusal(
        const Failure(kind: FailureKind.network, message: 'offline'),
      ),
      isFalse,
    );
  });

  testWidgets('block works in a thread opened from a notification', (
    tester,
  ) async {
    final api = directApi()
      ..on('POST /users/other/block', FakeResponse.data({'blocked': true}));
    await pumpThread(tester, api);
    expect(find.text('Karim'), findsOneWidget);
    expect(find.text('Fix the tap'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('chat-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Block user'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Block'));
    await tester.pumpAndSettle();
    expect(api.called('POST /users/other/block'), hasLength(1));
  });

  testWidgets('a group chat names senders and offers no block', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /conversations',
        FakeResponse.data({
          'items': [
            {
              'id': 'grp-1',
              'kind': 'GROUP',
              'title': 'Tailors of Boalia',
              'subject': {'type': 'COMMUNITY_GROUP', 'id': 'g1'},
              'participantCount': 12,
              'jobTitle': 'Tailors of Boalia',
              'otherName': 'Tailors of Boalia',
              'otherUserId': null,
              'unreadCount': 0,
              'updatedAt': '2026-11-16T08:00:00Z',
            },
          ],
        }),
      )
      ..on(
        'GET /community/groups/g1/members',
        FakeResponse.data({
          'items': [
            {'userId': 'u-7', 'displayName': 'Nasrin A.'},
          ],
        }),
      )
      ..on(
        'GET /conversations/grp-1/messages',
        FakeResponse.data({
          'items': [
            _message(
              'm-1',
              'Meeting at 5',
              sender: 'u-7',
              conversation: 'grp-1',
            ),
            _message('m-2', 'Hello all', sender: 'u-8', conversation: 'grp-1'),
          ],
        }),
      )
      ..on('POST /conversations/grp-1/read', FakeResponse.data({}));
    await pumpThread(tester, api, id: 'grp-1');
    expect(find.text('Nasrin A.'), findsOneWidget);
    expect(find.text('Member'), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-participants')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('chat-menu')));
    await tester.pumpAndSettle();
    expect(find.text('Block user'), findsNothing);
    await tester.tapAt(const Offset(10, 300));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('Meeting at 5'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('report-message')));
    await tester.pumpAndSettle();
    expect(find.text('route:/report/MESSAGE/m-1'), findsOneWidget);
  });

  testWidgets('protected screens switch screenshot blocking on and off', (
    tester,
  ) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final calls = <Object?>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      ScreenProtection.channel,
      (call) async {
        calls.add(call.arguments);
        return null;
      },
    );
    await tester.pumpWidget(
      const MaterialApp(home: SecureScreen(child: Text('NID'))),
    );
    await tester.pumpWidget(const MaterialApp(home: Text('Home')));
    expect(calls, [true, false]);
    expect(ScreenProtection.holders, 0);
    debugDefaultTargetPlatformOverride = null;
  });
}

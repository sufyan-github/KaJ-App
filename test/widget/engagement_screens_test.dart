import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/core/config/app_environment.dart';
import 'package:kaaj/core/connectivity/connectivity_service.dart';
import 'package:kaaj/core/storage/session_token_store.dart';
import 'package:kaaj/features/chat/data/chat_realtime_service.dart';
import 'package:kaaj/features/chat/data/chat_repository.dart';
import 'package:kaaj/features/chat/domain/chat_models.dart';
import 'package:kaaj/features/chat/presentation/controllers/chat_providers.dart';
import 'package:kaaj/features/chat/presentation/screens/chat_screens.dart';
import 'package:kaaj/features/jobs/presentation/screens/jobs_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

/// A socket that never connects, so the thread runs on HTTP alone.
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

  @override
  Stream<ChatMessage> get messages => _incoming.stream;

  @override
  void connect(String conversationId) {}

  void deliver(ChatMessage message) => _incoming.add(message);
}

/// The unsent-message queue in memory. Real Hive disk writes never finish
/// inside a widget test's fake clock.
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
  _FixedConnectivity({required this.online})
    : super(Connectivity(), probe: () async => online);

  bool online;

  @override
  Future<bool> isOnline() async => online;

  @override
  Stream<bool> get changes => const Stream.empty();
}

Map<String, dynamic> _message(
  String id,
  String body, {
  bool mine = false,
  String? nonce,
  String at = '2026-11-16T08:00:00Z',
}) => {
  'id': id,
  'conversationId': 'conv-1',
  'senderUserId': mine ? 'me' : 'other',
  'isMine': mine,
  'type': 'TEXT',
  'body': body,
  'clientNonce': nonce,
  'createdAt': at,
};

Map<String, dynamic> _assignment({
  required String status,
  String? jobStatus,
  bool worker = false,
}) => {
  'id': 'asg-1',
  'title': 'Fix the kitchen tap',
  'status': status,
  'jobStatus': jobStatus,
  'isWorker': worker,
  'isPoster': !worker,
  'workerUserId': 'worker-1',
  'posterUserId': 'poster-1',
  'jobId': 'job-1',
  'agreedStartsAt': '2026-11-20T04:00:00Z',
  'agreedEndsAt': '2026-11-20T06:00:00Z',
  'description': 'Replace the washer.',
  'locationName': 'বোয়ালিয়া',
  'timeline': <Object>[],
};

void main() {
  late _MemoryBox chatBox;

  setUp(() => chatBox = _MemoryBox());

  group('chat', () {
    testWidgets('the inbox lists conversations and opens a thread', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /conversations',
          FakeResponse.data({
            'items': [
              {
                'id': 'conv-1',
                'jobTitle': 'কলের পানি পড়া',
                'otherName': 'করিম',
                'otherUserId': 'other',
                'unreadCount': 2,
                'lastMessage': _message('m-1', 'কাল সকালে আসব'),
                'updatedAt': '2026-11-16T08:00:00Z',
              },
            ],
          }),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const ChatListScreen(),
        locale: const Locale('bn'),
        overrides: [
          chatRepositoryProvider.overrideWithValue(
            ChatRepository(api.dio(), chatBox),
          ),
        ],
      );
      expect(find.textContaining('করিম'), findsWidgets);
      expect(find.textContaining('কাল সকালে আসব'), findsOneWidget);
      await tester.tap(find.textContaining('কলের পানি পড়া'));
      await tester.pumpAndSettle();
      expect(find.text('route:/conversations/conv-1'), findsOneWidget);
    });

    Future<(FakeApi, _QuietRealtime)> pumpThread(
      WidgetTester tester, {
      required bool online,
    }) async {
      final api = FakeApi()
        ..on(
          'GET /conversations/conv-1/messages',
          FakeResponse.data({
            'items': [_message('m-1', 'কখন আসবেন?')],
          }),
        )
        ..on('POST /conversations/conv-1/read', FakeResponse.data({}))
        ..onRequest('POST /conversations/conv-1/messages', (request) {
          final body = request.data! as Map;
          return FakeResponse.data(
            _message(
              'm-2',
              body['body'] as String,
              mine: true,
              nonce: body['clientNonce'] as String,
              at: '2026-11-16T09:00:00Z',
            ),
          );
        });
      final realtime = _QuietRealtime();
      await pumpRouted(
        tester,
        api: api,
        home: const ChatThreadScreen(
          conversationId: 'conv-1',
          jobTitle: 'কলের পানি পড়া',
          otherName: 'করিম',
          otherUserId: 'other',
        ),
        locale: const Locale('bn'),
        overrides: [
          chatRepositoryProvider.overrideWithValue(
            ChatRepository(api.dio(), chatBox),
          ),
          chatRealtimeProvider.overrideWith((ref) => realtime),
          connectivityServiceProvider.overrideWithValue(
            _FixedConnectivity(online: online),
          ),
        ],
      );
      return (api, realtime);
    }

    testWidgets('loads the thread, marks it read and sends a message', (
      tester,
    ) async {
      final (api, _) = await pumpThread(tester, online: true);
      expect(find.text('কখন আসবেন?'), findsOneWidget);
      expect(api.called('POST /conversations/conv-1/read'), isNotEmpty);

      await tester.enterText(find.byType(TextField), 'দশটায় আসব');
      await tester.tap(find.byTooltip('পাঠান'));
      await tester.pumpAndSettle();

      final sent = api.called('POST /conversations/conv-1/messages').single;
      final body = sent.data! as Map;
      expect(body['body'], 'দশটায় আসব');
      expect(body['clientNonce'], isNotEmpty);
      expect(find.text('দশটায় আসব'), findsOneWidget);
      expect(chatBox.get('pending:conv-1'), isEmpty);
    });

    testWidgets('keeps an offline message queued on the phone', (tester) async {
      final (api, _) = await pumpThread(tester, online: false);
      await tester.enterText(find.byType(TextField), 'নেট নেই');
      await tester.tap(find.byTooltip('পাঠান'));
      await tester.pumpAndSettle();

      expect(api.called('POST /conversations/conv-1/messages'), isEmpty);
      expect(find.text('নেট নেই'), findsOneWidget);
      final queued = chatBox.get('pending:conv-1') as List;
      expect(queued, hasLength(1));
      expect((queued.single as Map)['body'], 'নেট নেই');
    });

    testWidgets('shows a message that arrives over the socket', (tester) async {
      final (_, realtime) = await pumpThread(tester, online: true);
      realtime.deliver(
        ChatMessage.fromJson(
          _message('m-9', 'রাস্তায় আছি', at: '2026-11-16T09:30:00Z'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('রাস্তায় আছি'), findsOneWidget);
    });
  });

  group('assignments', () {
    testWidgets('the list opens an assignment', (tester) async {
      final api = FakeApi()
        ..on(
          'GET /assignments',
          FakeResponse.data({
            'items': [
              _assignment(status: 'PENDING_CONFIRMATION', worker: true),
            ],
          }),
        )
        ..on(
          'GET /assignments/asg-1',
          FakeResponse.data(
            _assignment(status: 'PENDING_CONFIRMATION', worker: true),
          ),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const AssignmentsScreen(),
        locale: const Locale('bn'),
      );
      expect(find.text('Fix the kitchen tap'), findsOneWidget);
      await tester.tap(find.text('Fix the kitchen tap'));
      await tester.pumpAndSettle();
      expect(find.text('কাজের বিস্তারিত ও অগ্রগতি'), findsOneWidget);
      expect(api.called('GET /assignments/asg-1'), hasLength(1));
    });

    Future<FakeApi> pumpDetail(
      WidgetTester tester,
      Map<String, dynamic> assignment, {
      Map<String, dynamic>? reviews,
    }) async {
      final api = FakeApi()
        ..on('GET /assignments/asg-1', FakeResponse.data(assignment))
        ..on('POST /assignments/asg-1/confirm', FakeResponse.data({}))
        ..on('POST /assignments/asg-1/submit', FakeResponse.data({}))
        ..on('POST /assignments/asg-1/complete', FakeResponse.data({}))
        ..on('POST /assignments/asg-1/reviews', FakeResponse.data({'id': 'r'}));
      if (reviews != null) {
        api.on('GET /assignments/asg-1/reviews', FakeResponse.data(reviews));
      }
      await pumpRouted(
        tester,
        api: api,
        home: const AssignmentDetailScreen(assignmentId: 'asg-1'),
        locale: const Locale('bn'),
        size: const Size(400, 2400),
      );
      return api;
    }

    testWidgets('a worker confirms a booking', (tester) async {
      final api = await pumpDetail(
        tester,
        _assignment(status: 'PENDING_CONFIRMATION', worker: true),
      );
      await tester.tap(find.text('কাজটি নিশ্চিত করুন'));
      await tester.pumpAndSettle();
      expect(api.called('POST /assignments/asg-1/confirm'), hasLength(1));
      // The detail is reloaded to show the new state.
      expect(api.called('GET /assignments/asg-1').length, greaterThan(1));
    });

    testWidgets('a worker sends finished work to the customer', (tester) async {
      final api = await pumpDetail(
        tester,
        _assignment(
          status: 'CONFIRMED',
          jobStatus: 'IN_PROGRESS',
          worker: true,
        ),
      );
      await tester.ensureVisible(find.text('কাজ শেষ—গ্রাহকের কাছে পাঠান'));
      await tester.tap(find.text('কাজ শেষ—গ্রাহকের কাছে পাঠান'));
      await tester.pumpAndSettle();
      expect(api.called('POST /assignments/asg-1/submit'), hasLength(1));
    });

    testWidgets('a poster confirms completion', (tester) async {
      final api = await pumpDetail(
        tester,
        _assignment(status: 'CONFIRMED', jobStatus: 'CUSTOMER_REVIEW'),
      );
      await tester.ensureVisible(find.text('কাজ সম্পন্ন নিশ্চিত করুন'));
      await tester.tap(find.text('কাজ সম্পন্ন নিশ্চিত করুন'));
      await tester.pumpAndSettle();
      expect(api.called('POST /assignments/asg-1/complete'), hasLength(1));
    });

    testWidgets('a refused action explains the server reason', (tester) async {
      final api = await pumpDetail(
        tester,
        _assignment(status: 'PENDING_CONFIRMATION', worker: true),
      );
      api.on(
        'POST /assignments/asg-1/confirm',
        FakeResponse.error(403, 'ACCOUNT_RESTRICTED'),
      );
      await tester.tap(find.text('কাজটি নিশ্চিত করুন'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('আপনার অ্যাকাউন্টে কাজের সুবিধা সাময়িকভাবে সীমিত'),
        findsOneWidget,
      );
    });
  });

  group('reviews', () {
    testWidgets('a poster reviews a completed job with sub-scores', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /assignments/asg-1',
          FakeResponse.data(
            _assignment(status: 'COMPLETED', jobStatus: 'COMPLETED'),
          ),
        )
        ..on(
          'GET /assignments/asg-1/reviews',
          FakeResponse.data({
            'canReview': true,
            'revealed': false,
            'windowEndsAt': '2026-11-27T00:00:00Z',
          }),
        )
        ..on('POST /assignments/asg-1/reviews', FakeResponse.data({'id': 'r'}));
      await pumpRouted(
        tester,
        api: api,
        home: const AssignmentDetailScreen(assignmentId: 'asg-1'),
        size: const Size(400, 2400),
      );
      await tester.ensureVisible(find.text('Leave a review'));
      await tester.tap(find.text('Leave a review'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Overall rating: 5 of 5'));
      await tester.tap(find.byTooltip('Communication: 3 of 5'));
      await tester.pump();
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();

      final body =
          api.called('POST /assignments/asg-1/reviews').single.data! as Map;
      expect(body['rating'], 5);
      expect(body['communication'], 3);
      expect(body['punctuality'], 5);
      expect(api.called('GET /assignments/asg-1/reviews').length, 2);
    });

    testWidgets('received reviews list names, stars and comments', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /reviews/received',
          FakeResponse.data({
            'items': [
              {
                'id': 'r-1',
                'reviewerName': 'রহিম',
                'rating': 4,
                'comment': 'সময়মতো এসেছেন',
                'createdAt': '2026-11-15T10:00:00Z',
              },
              {
                'id': 'r-2',
                'reviewerName': 'সালমা',
                'rating': 5,
                'createdAt': '2026-11-14T10:00:00Z',
              },
            ],
          }),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const ReceivedReviewsScreen(),
        locale: const Locale('bn'),
      );
      expect(find.text('রহিম · ★★★★☆'), findsOneWidget);
      expect(find.text('সময়মতো এসেছেন'), findsOneWidget);
      expect(find.text('সালমা · ★★★★★'), findsOneWidget);
      expect(find.text('কোনো মন্তব্য দেওয়া হয়নি।'), findsOneWidget);
    });

    testWidgets('no reviews yet shows the empty state', (tester) async {
      final api = FakeApi()
        ..on('GET /reviews/received', FakeResponse.data({'items': <Object>[]}));
      await pumpRouted(
        tester,
        api: api,
        home: const ReceivedReviewsScreen(),
        locale: const Locale('bn'),
      );
      expect(find.text('এখনো প্রকাশিত কোনো রিভিউ নেই।'), findsOneWidget);
    });
  });
}

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/core/errors/error_mapper.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/widgets/k_error_message.dart';
import 'package:kaaj/features/chat/data/chat_repository.dart';
import 'package:kaaj/features/chat/presentation/controllers/chat_providers.dart';
import 'package:kaaj/features/chat/presentation/screens/chat_screens.dart';
import 'package:kaaj/features/jobs/presentation/screens/jobs_screens.dart';
import 'package:kaaj/features/learning/domain/learning_models.dart';
import 'package:kaaj/features/trust_safety/presentation/safety_screens.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

class _NoBox implements Box<dynamic> {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Map<String, dynamic> _conversation(String id, String name) => {
  'id': id,
  'kind': 'DIRECT',
  'jobTitle': 'Fix the tap',
  'otherName': name,
  'otherUserId': 'u-$id',
  'unreadCount': 0,
  'updatedAt': '2026-11-20T08:00:00Z',
};

FakeResponse Function(RecordedRequest) _twoPages(
  Object Function(String id) item,
) =>
    (request) => request.query['cursor'] == 'next'
    ? FakeResponse.data({
        'items': [item('b')],
        'nextCursor': null,
      })
    : FakeResponse.data({
        'items': [item('a')],
        'nextCursor': 'next',
      });

void main() {
  group('paging (R3)', () {
    testWidgets('the conversation list loads more', (tester) async {
      final api = FakeApi()
        ..onRequest(
          'GET /conversations',
          _twoPages((id) => _conversation(id, 'Person $id')),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const ChatListScreen(),
        overrides: [
          chatRepositoryProvider.overrideWithValue(
            ChatRepository(api.dio(), _NoBox()),
          ),
        ],
      );
      expect(find.textContaining('Person a'), findsWidgets);
      await tester.tap(find.byKey(const ValueKey('conversations-load-more')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Person b'), findsWidgets);
      expect(api.called('GET /conversations').last.query['cursor'], 'next');
    });

    testWidgets('favourites load more and refresh', (tester) async {
      final api = FakeApi()
        ..onRequest(
          'GET /me/favorites',
          _twoPages(
            (id) => {
              'userId': 'w-$id',
              'displayName': 'Worker $id',
              'ratingAverage': '4.5',
            },
          ),
        );
      await pumpRouted(tester, api: api, home: const FavoriteWorkersScreen());
      expect(find.text('Worker a'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('favorites-load-more')));
      await tester.pumpAndSettle();
      expect(find.text('Worker b'), findsOneWidget);
    });

    testWidgets('blocked people load more (bn)', (tester) async {
      final api = FakeApi()
        ..onRequest(
          'GET /me/blocks',
          _twoPages((id) => {'userId': 'b-$id', 'displayName': 'Blocked $id'}),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const BlockedUsersScreen(),
        locale: const Locale('bn'),
      );
      expect(find.text('Blocked a'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('blocked-load-more')));
      await tester.pumpAndSettle();
      expect(find.text('Blocked b'), findsOneWidget);
    });
  });

  test('new codes have their own copy', () {
    for (final language in ['en', 'bn']) {
      final l10n = lookupAppLocalizations(Locale(language));
      for (final code in ['WORKER_NOT_VERIFIED', 'SESSION_BEFORE_ENROLMENT']) {
        final text = serverCodeMessage(
          l10n,
          Failure(kind: FailureKind.conflict, message: 'x', code: code),
        );
        expect(text, isNotNull, reason: code);
      }
    }
  });

  test('the server action to verify identity is read', () {
    final failure = ErrorMapper.from(
      DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: 409,
          data: {
            'error': {
              'code': 'CONFLICT',
              'message': 'x',
              'action': {'type': 'VERIFY_IDENTITY'},
            },
          },
        ),
      ),
    );
    expect(failure.actionType, 'VERIFY_IDENTITY');
    expect(failure.needsIdentityVerification, isTrue);
  });

  test('sessions cannot be dated more than a week before enrolment', () {
    final enrolment = LearningEnrolment.fromJson({
      'id': 'e1',
      'role': 'MENTOR',
      'status': 'CONFIRMED',
      'enrolledAt': '2026-11-10T06:00:00Z',
    });
    final now = DateTime(2026, 11, 20);
    final earliest = enrolment.earliestSessionDate(now);
    expect(earliest, DateTime(2026, 11, 3));
    // Without an enrolment date the year-long window stays.
    final older = LearningEnrolment.fromJson({
      'id': 'e2',
      'role': 'MENTOR',
      'status': 'CONFIRMED',
    });
    expect(
      older.earliestSessionDate(now),
      now.subtract(const Duration(days: 365)),
    );
  });
}

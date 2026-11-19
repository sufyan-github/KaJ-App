import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/widgets/k_error_message.dart';
import 'package:kaaj/features/learning/presentation/enrolment_screens.dart';
import 'package:kaaj/features/learning/presentation/learning_detail_screen.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _opportunity({Map<String, dynamic>? application}) => {
  'id': 'opp-1',
  'opportunityType': 'TRAINING',
  'title': 'House wiring basics',
  'description': 'Four Saturday sessions.',
  'status': 'APPLICATIONS_OPEN',
  'participantTerms': 'FREE',
  'seats': 6,
  'seatsFilled': 1,
  'workArrangement': 'ON_SITE',
  'viewerIsMentor': false,
  'viewerApplication': ?application,
};

Map<String, dynamic> _enrolment({
  String status = 'CONFIRMED',
  bool completed = false,
  String? withdrawnAt,
}) => {
  'id': 'e1',
  'role': 'LEARNER',
  'status': status,
  'opportunity': {
    'id': 'opp-1',
    'title': 'House wiring basics',
    'opportunityType': 'TRAINING',
  },
  'learner': {'userId': 'l1', 'displayName': 'Shila A.'},
  'contract': {'terms': 'FREE'},
  'sessions': <Object>[],
  'progress': {
    'sessionsRecorded': 0,
    'sessionsConfirmed': 0,
    'minutesTotal': 0,
  },
  'completionRecord': completed
      ? {
          'id': 'c1',
          'code': 'PRX42',
          'issuedAt': '2026-12-14T09:00:00Z',
          'status': 'VALID',
          'verifyPath': '/api/v1/certificates/PRX42',
        }
      : null,
  'withdrawnAt': withdrawnAt,
};

void main() {
  testWidgets('a pending application can be withdrawn', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /learning-opportunities/opp-1',
        FakeResponse.data(
          _opportunity(application: {'id': 'app-1', 'status': 'PENDING'}),
        ),
      )
      ..on(
        'POST /learning-applications/app-1/withdraw',
        FakeResponse.data({'id': 'app-1', 'status': 'WITHDRAWN'}),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const LearningDetailScreen(opportunityId: 'opp-1'),
      size: const Size(400, 2000),
    );
    await tester.tap(find.byKey(const ValueKey('learning-withdraw')));
    await tester.pumpAndSettle();
    api.on(
      'GET /learning-opportunities/opp-1',
      FakeResponse.data(
        _opportunity(application: {'id': 'app-1', 'status': 'WITHDRAWN'}),
      ),
    );
    await tester.tap(find.text('Withdraw').last);
    await tester.pumpAndSettle();
    expect(
      api.called('POST /learning-applications/app-1/withdraw'),
      hasLength(1),
    );
    // Withdrawn: Apply is offered again.
    expect(find.byKey(const ValueKey('learning-apply')), findsOneWidget);
  });

  testWidgets('a learner leaves an active enrolment', (tester) async {
    final api = FakeApi()
      ..on('GET /learning-enrolments/e1', FakeResponse.data(_enrolment()));
    await pumpRouted(
      tester,
      api: api,
      home: const EnrolmentScreen(enrolmentId: 'e1'),
      size: const Size(400, 2000),
    );
    final left = _enrolment(
      status: 'CANCELLED',
      withdrawnAt: '2026-11-17T09:00:00Z',
    );
    api
      ..on('POST /learning-enrolments/e1/withdraw', FakeResponse.data(left))
      ..on('GET /learning-enrolments/e1', FakeResponse.data(left));
    await tester.tap(find.byKey(const ValueKey('leave-learning')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Leave'));
    await tester.pumpAndSettle();
    expect(api.called('POST /learning-enrolments/e1/withdraw'), hasLength(1));
    expect(find.text('You have left this learning.'), findsOneWidget);
    expect(find.byKey(const ValueKey('leave-learning')), findsNothing);
  });

  testWidgets('after completion the learner reviews the mentor', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /learning-enrolments/e1',
        FakeResponse.data(_enrolment(status: 'COMPLETED', completed: true)),
      )
      ..on(
        'GET /reviews/subject',
        FakeResponse.data({
          'subjectType': 'LEARNING_ENROLMENT',
          'subjectId': 'e1',
          'canReview': true,
          'revealed': false,
          'windowEndsAt': '2026-12-21T09:00:00Z',
        }),
      )
      ..on(
        'POST /reviews',
        FakeResponse.data({'submitted': true, 'revealed': false}),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const EnrolmentScreen(enrolmentId: 'e1'),
      size: const Size(400, 2400),
    );
    expect(
      api.called('GET /reviews/subject').single.query['subjectType'],
      'LEARNING_ENROLMENT',
    );
    await tester.ensureVisible(find.byKey(const ValueKey('review-learning')));
    await tester.tap(find.byKey(const ValueKey('review-learning')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();
    final body = api.called('POST /reviews').single.data! as Map;
    expect(body['subjectType'], 'LEARNING_ENROLMENT');
    expect(body['subjectId'], 'e1');
    expect(body['rating'], 5);
    expect(api.called('GET /reviews/subject'), hasLength(2));
  });

  for (final language in ['en', 'bn']) {
    test('P2 and Learn codes have their own $language copy', () {
      final l10n = lookupAppLocalizations(Locale(language));
      for (final code in [
        'REAPPLY_NOT_ALLOWED',
        'APPLICATION_NOT_WITHDRAWABLE',
        'BUSINESS_PROFILE_INCOMPLETE',
        'OWN_SUBJECT',
        'IDEA_ACCESS_ALREADY_REQUESTED',
        'COLLABORATION_TRANSITION_NOT_ALLOWED',
      ]) {
        final message = serverCodeMessage(
          l10n,
          Failure(kind: FailureKind.conflict, message: 'x', code: code),
        );
        expect(message, isNotNull, reason: code);
        expect(
          RegExp('[ঀ-৿]').hasMatch(message!),
          language == 'bn',
          reason: code,
        );
      }
    });
  }
}

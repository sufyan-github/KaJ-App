import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/routing/app_router.dart';
import 'package:kaaj/core/widgets/k_error_message.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';
import 'package:kaaj/features/jobs/presentation/screens/job_detail_screen.dart';
import 'package:kaaj/features/jobs/presentation/screens/jobs_screens.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _job({String status = 'APPLICATIONS_OPEN'}) => {
  'id': 'job-1',
  'title': 'Fix the kitchen tap',
  'status': status,
  'viewerIsPoster': true,
};

void main() {
  group('job feed text search', () {
    for (final (typed, expected) in [('tap', 'tap'), ('t', null)]) {
      testWidgets('"$typed" is ${expected == null ? 'not ' : ''}sent as q', (
        tester,
      ) async {
        final api = FakeApi()
          ..on('GET /jobs', FakeResponse.data({'items': <Object>[]}));
        await pumpRouted(
          tester,
          api: api,
          home: JobFeedScreen(embedded: true, searchQuery: typed),
          overrides: [meAs(KaajRole.worker)],
        );
        expect(api.called('GET /jobs').last.query['q'], expected);
      });
    }
  });

  group('closing a post', () {
    testWidgets('the poster closes an open post', (tester) async {
      final api = FakeApi()
        ..on('GET /jobs/job-1', FakeResponse.data(_job()))
        ..on(
          'POST /jobs/job-1/close',
          FakeResponse.data({'id': 'job-1', 'status': 'CANCELLED_BY_CUSTOMER'}),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const JobDetailScreen(jobId: 'job-1'),
        overrides: [meAs(KaajRole.customer)],
        size: const Size(400, 1600),
      );
      await tester.tap(find.byKey(const ValueKey('job-close')));
      await tester.pumpAndSettle();
      api.on(
        'GET /jobs/job-1',
        FakeResponse.data(_job(status: 'CANCELLED_BY_CUSTOMER')),
      );
      await tester.tap(find.byKey(const ValueKey('job-close-confirm')));
      await tester.pumpAndSettle();
      expect(api.called('POST /jobs/job-1/close'), hasLength(1));
      expect(find.text('The post is closed.'), findsOneWidget);
      expect(find.byKey(const ValueKey('job-close')), findsNothing);
    });

    testWidgets('a booked post explains why it cannot close (bn)', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /jobs/job-1', FakeResponse.data(_job()))
        ..on(
          'POST /jobs/job-1/close',
          FakeResponse.error(409, 'JOB_NOT_CLOSABLE'),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const JobDetailScreen(jobId: 'job-1'),
        locale: const Locale('bn'),
        overrides: [meAs(KaajRole.customer)],
        size: const Size(400, 1600),
      );
      await tester.tap(find.byKey(const ValueKey('job-close')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('job-close-confirm')));
      await tester.pumpAndSettle();
      expect(find.textContaining('আগে বুকিংটি বাতিল করুন'), findsOneWidget);
    });

    testWidgets('a filled or closed post offers no close', (tester) async {
      final api = FakeApi()
        ..on('GET /jobs/job-1', FakeResponse.data(_job(status: 'EXPIRED')));
      await pumpRouted(
        tester,
        api: api,
        home: const JobDetailScreen(jobId: 'job-1'),
        overrides: [meAs(KaajRole.customer)],
      );
      expect(find.byKey(const ValueKey('job-close')), findsNothing);
    });
  });

  test('a second booking for the same slot is explained', () {
    for (final language in ['en', 'bn']) {
      final text = serverCodeMessage(
        lookupAppLocalizations(Locale(language)),
        const Failure(
          kind: FailureKind.conflict,
          message: 'x',
          code: 'BOOKING_ALREADY_PENDING',
        ),
      );
      expect(
        text,
        language == 'en'
            ? 'This worker already has a booking request waiting for this time.'
            : contains('অপেক্ষায় আছে'),
      );
    }
  });

  test('mentors reach their availability without a subscription', () {
    const learner = AuthState(
      status: AuthStatus.authenticated,
      subscriptionAccess: false,
      freeModules: {'LEARN', 'COMMUNITY'},
    );
    expect(authRedirect(learner, AppRoutes.editAvailability), isNull);
    const older = AuthState(
      status: AuthStatus.authenticated,
      subscriptionAccess: false,
    );
    expect(
      authRedirect(older, AppRoutes.editAvailability),
      AppRoutes.subscription,
    );
  });
}

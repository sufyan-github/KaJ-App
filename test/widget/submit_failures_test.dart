import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/widgets/k_primary_button.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/trust_safety/presentation/dispute_screens.dart';

import '../features/jobs/job_detail_alerts_repository_test.dart'
    show jobDetailJson;
import '../support/fake_api.dart';
import '../support/pump_app.dart';

FakeResponse _refused(int status, String code, String message) =>
    FakeResponse(status, {
      'error': {'code': code, 'message': message, 'requestId': 'req-1'},
    });

void main() {
  FakeApi jobApi({bool canApply = true}) => FakeApi()
    ..on('GET /jobs/job-1', FakeResponse.data(jobDetailJson()))
    ..on(
      'GET /verification-requests/application-eligibility',
      FakeResponse.data({
        'canApply': canApply,
        'identityStatus': canApply ? 'APPROVED' : 'PENDING',
      }),
    );

  Future<void> openJob(
    WidgetTester tester,
    FakeApi api, {
    String lang = 'en',
  }) => pumpRouted(
    tester,
    api: api,
    initial: '/jobs/job-1',
    locale: Locale(lang),
    overrides: [meAs(KaajRole.worker)],
  );

  testWidgets('N3: an approval during the session unlocks Apply at once', (
    tester,
  ) async {
    final api = jobApi(canApply: false);
    await openJob(tester, api, lang: 'bn');

    await tester.tap(find.byKey(const ValueKey('job-apply')));
    await tester.pumpAndSettle();
    expect(find.text('আবেদনের আগে পরিচয় যাচাই করুন'), findsOneWidget);
    await tester.tap(find.text('পরে'));
    await tester.pumpAndSettle();

    // An admin approves the identity check.
    api.on(
      'GET /verification-requests/application-eligibility',
      FakeResponse.data({'canApply': true, 'identityStatus': 'APPROVED'}),
    );
    await tester.tap(find.byKey(const ValueKey('job-apply')));
    await tester.pumpAndSettle();

    expect(find.text('এই কাজে আবেদন করুন'), findsOneWidget);
    expect(
      api.called('GET /verification-requests/application-eligibility'),
      hasLength(2),
    );
  });

  group('N4: a refused submit is shown, not swallowed', () {
    testWidgets('slot unavailable keeps the dialog open with the reason', (
      tester,
    ) async {
      final api = jobApi()
        ..on(
          'POST /jobs/job-1/applications',
          _refused(409, 'SLOT_UNAVAILABLE', 'Worker is not available.'),
        );
      await openJob(tester, api);
      await tester.tap(find.byKey(const ValueKey('job-apply')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Submit application'));
      await tester.pumpAndSettle();

      expect(find.byType(AlertDialog), findsOneWidget);
      expect(
        find.textContaining('You are not free at this time'),
        findsOneWidget,
      );
    });

    testWidgets('an older server sending CONFLICT is understood too (bn)', (
      tester,
    ) async {
      final api = jobApi()
        ..on(
          'POST /jobs/job-1/applications',
          _refused(409, 'CONFLICT', 'Worker is not available for this slot.'),
        );
      await openJob(tester, api, lang: 'bn');
      await tester.tap(find.byKey(const ValueKey('job-apply')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('আবেদন পাঠান'));
      await tester.pumpAndSettle();

      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.textContaining('এই সময়ে আপনি খালি নেই'), findsOneWidget);
    });

    testWidgets('a dispute that is not eligible says so on the form', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'POST /assignments/asg-1/disputes',
          _refused(
            409,
            'DISPUTE_NOT_ELIGIBLE',
            'This assignment is not eligible for dispute.',
          ),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const OpenDisputeScreen(assignmentId: 'asg-1'),
        size: const Size(400, 2000),
      );
      await tester.enterText(
        find.byType(TextField).last,
        'The worker left after one hour and did not finish.',
      );
      await tester.ensureVisible(find.byType(KPrimaryButton));
      await tester.tap(find.byType(KPrimaryButton));
      await tester.pumpAndSettle();

      expect(
        find.text("A dispute can't be opened for this job at this stage."),
        findsWidgets,
      );
    });
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/billing/presentation/billing_providers.dart';
import 'package:kaaj/features/jobs/presentation/screens/job_detail_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/profile/presentation/screens/phase2_hub_screens.dart';
import 'package:kaaj/features/trust_safety/presentation/safety_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

void main() {
  test('report offers every reason and target the server accepts', () {
    expect(
      reportReasons.keys,
      containsAll([
        'HARASSMENT',
        'SEXUAL_HARASSMENT',
        'STALKING',
        'UNSAFE_LOCATION',
        'SCAM',
        'OTHER',
      ]),
    );
    expect(reportReasons, hasLength(13));
    expect(reportTargets, hasLength(13));
    expect(isReportableTarget('SESSION', 'a1b2-c3'), isTrue);
    expect(isReportableTarget('ANYTHING', 'a1'), isFalse);
    expect(isReportableTarget('USER', '../admin'), isFalse);
  });

  testWidgets('a women-safety reason is sent with the report', (tester) async {
    final api = FakeApi()
      ..on('POST /reports', FakeResponse.data({'id': 'r1', 'status': 'OPEN'}));
    await pumpRouted(
      tester,
      api: api,
      home: const ReportScreen(targetType: 'SESSION', targetId: 's1'),
      size: const Size(400, 1600),
    );
    expect(find.text('Reporting: A session'), findsOneWidget);
    await tester.tap(find.text('Harassment or threats'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stalking or being watched').last);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField),
      'He followed me home after the session.',
    );
    await tester.tap(find.text('Submit report'));
    // The button keeps spinning behind the success dialog.
    await tester.pump(const Duration(milliseconds: 300));
    expect(api.called('POST /reports').single.data, {
      'targetType': 'SESSION',
      'targetId': 's1',
      'reasonCode': 'STALKING',
      'description': 'He followed me home after the session.',
    });
  });

  testWidgets('a refused report shows the server reason (bn)', (tester) async {
    final api = FakeApi()
      ..on('POST /reports', FakeResponse.error(409, 'CONFLICT'));
    await pumpRouted(
      tester,
      api: api,
      home: const ReportScreen(targetType: 'USER', targetId: 'u1'),
      locale: const Locale('bn'),
      size: const Size(400, 1600),
    );
    await tester.enterText(find.byType(TextField), 'বারবার টাকা চাইছে।');
    await tester.tap(find.text('রিপোর্ট জমা দিন'));
    await tester.pumpAndSettle();
    expect(
      find.text('রিপোর্ট জমা দেওয়া যায়নি।\nRequest refused (CONFLICT)'),
      findsOneWidget,
    );
  });

  testWidgets('an unknown target from a link is not sent', (tester) async {
    final api = FakeApi();
    await pumpRouted(
      tester,
      api: api,
      home: const ReportScreen(targetType: 'PAYMENT', targetId: 'x1'),
    );
    expect(find.text('This cannot be reported'), findsOneWidget);
    expect(find.text('Submit report'), findsNothing);
  });

  for (final language in ['en', 'bn']) {
    testWidgets('999 and 109 open the phone dialer ($language)', (
      tester,
    ) async {
      final dialled = <Uri>[];
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: const HelpSafetyScreen(),
        locale: Locale(language),
        size: const Size(400, 1600),
        overrides: [
          externalUriLauncherProvider.overrideWithValue((uri) async {
            dialled.add(uri);
            return true;
          }),
        ],
      );
      await tester.tap(find.byKey(const ValueKey('call-999')));
      await tester.tap(find.byKey(const ValueKey('call-109')));
      await tester.pumpAndSettle();
      expect(dialled.map((uri) => uri.toString()), ['tel:999', 'tel:109']);
      if (language == 'en') {
        expect(
          find.text('Helpline against violence on women and children 109'),
          findsOneWidget,
        );
      }
    });
  }

  testWidgets('when no dialer opens, the number is shown', (tester) async {
    await pumpRouted(
      tester,
      api: FakeApi(),
      home: const HelpSafetyScreen(),
      size: const Size(400, 1600),
      overrides: [
        externalUriLauncherProvider.overrideWithValue((uri) async => false),
      ],
    );
    await tester.tap(find.byKey(const ValueKey('call-109')));
    await tester.pumpAndSettle();
    expect(
      find.text('Could not open the phone app. Dial it yourself: 109'),
      findsOneWidget,
    );
  });

  testWidgets('a job can be reported from its detail', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /jobs/job-1',
        FakeResponse.data({
          'id': 'job-1',
          'title': 'Fix the kitchen tap',
          'status': 'OPEN',
          'viewerIsPoster': false,
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const JobDetailScreen(jobId: 'job-1'),
      overrides: [meAs(KaajRole.worker)],
    );
    await tester.tap(find.byKey(const ValueKey('report-JOB')));
    await tester.pumpAndSettle();
    expect(find.text('route:/report/JOB/job-1'), findsOneWidget);
  });
}

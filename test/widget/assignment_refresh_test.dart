import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/jobs/presentation/screens/jobs_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _assignment({
  String status = 'CONFIRMED',
  String? jobStatus,
  bool worker = false,
  bool? canDispute,
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
  'locationName': 'Boalia',
  'timeline': <Object>[],
  'canDispute': ?canDispute,
};

/// Lets the re-fetch finish. The screen keeps the old data while it loads,
/// so no frame is scheduled and pumpAndSettle alone would not wait for it.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pumpAndSettle();
}

void main() {
  const confirmCompletion = 'কাজ সম্পন্ন নিশ্চিত করুন';

  Future<FakeApi> pumpDetail(
    WidgetTester tester,
    Map<String, dynamic> first,
  ) async {
    final api = FakeApi()
      ..on('GET /assignments/asg-1', FakeResponse.data(first));
    await pumpRouted(
      tester,
      api: api,
      home: const AssignmentDetailScreen(assignmentId: 'asg-1'),
      locale: const Locale('bn'),
      size: const Size(400, 2400),
    );
    return api;
  }

  testWidgets('pull-to-refresh shows the job moving to customer review', (
    tester,
  ) async {
    final api = await pumpDetail(tester, _assignment(jobStatus: 'IN_PROGRESS'));
    expect(find.text(confirmCompletion), findsNothing);

    // The worker checked out on their phone.
    api.on(
      'GET /assignments/asg-1',
      FakeResponse.data(_assignment(jobStatus: 'CUSTOMER_REVIEW')),
    );
    await tester.drag(find.byType(ListView).first, const Offset(0, 900));
    await tester.pump();
    // The refresh indicator's arm and spin animations, then the fetch.
    await tester.pump(const Duration(seconds: 1));
    await _settle(tester);

    expect(api.called('GET /assignments/asg-1'), hasLength(2));
    expect(find.text(confirmCompletion), findsOneWidget);
  });

  testWidgets('coming back to the app re-reads the assignment', (tester) async {
    final api = await pumpDetail(tester, _assignment(jobStatus: 'IN_PROGRESS'));
    api.on(
      'GET /assignments/asg-1',
      FakeResponse.data(_assignment(jobStatus: 'CUSTOMER_REVIEW')),
    );
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await _settle(tester);

    expect(api.called('GET /assignments/asg-1'), hasLength(2));
    expect(find.text(confirmCompletion), findsOneWidget);
  });

  testWidgets('re-opening an assignment never shows a cached copy', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /assignments',
        FakeResponse.data({
          'items': [_assignment(jobStatus: 'IN_PROGRESS')],
        }),
      )
      ..on(
        'GET /assignments/asg-1',
        FakeResponse.data(_assignment(jobStatus: 'IN_PROGRESS')),
      );
    final router = await pumpRouted(
      tester,
      api: api,
      home: const AssignmentsScreen(),
      locale: const Locale('bn'),
    );
    await tester.tap(find.text('Fix the kitchen tap'));
    await tester.pumpAndSettle();
    router.pop();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fix the kitchen tap'));
    await tester.pumpAndSettle();

    expect(api.called('GET /assignments/asg-1'), hasLength(2));
    // The list is re-read after each return from the detail.
    expect(api.called('GET /assignments').length, greaterThanOrEqualTo(2));
  });

  testWidgets('the list shows the job progress, not just "confirmed"', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /assignments',
        FakeResponse.data({
          'items': [_assignment(jobStatus: 'CUSTOMER_REVIEW')],
        }),
      );
    await pumpRouted(tester, api: api, home: const AssignmentsScreen());
    expect(find.textContaining('review', findRichText: true), findsWidgets);
    expect(find.text('Confirmed'), findsNothing);
  });

  group('dispute button follows canDispute', () {
    const openDispute = 'বিরোধ খুলুন';

    testWidgets('hidden when the server says no', (tester) async {
      await pumpDetail(
        tester,
        _assignment(jobStatus: 'CUSTOMER_REVIEW', canDispute: false),
      );
      expect(find.text(openDispute), findsNothing);
    });

    testWidgets('shown when the server says yes', (tester) async {
      await pumpDetail(
        tester,
        _assignment(jobStatus: 'IN_PROGRESS', canDispute: true),
      );
      expect(find.text(openDispute), findsOneWidget);
    });

    testWidgets('an older server keeps the job-status rule', (tester) async {
      await pumpDetail(tester, _assignment(jobStatus: 'CUSTOMER_REVIEW'));
      expect(find.text(openDispute), findsOneWidget);
    });
  });
}

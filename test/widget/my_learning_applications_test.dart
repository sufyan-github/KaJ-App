import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/learning/presentation/enrolment_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _application(
  String id,
  String title,
  String status, {
  String? enrolmentId,
}) => {
  'id': id,
  'status': status,
  'message': null,
  'appliedAt': '2026-11-20T08:00:00Z',
  'enrolmentId': enrolmentId,
  'opportunity': {
    'id': 'opp-$id',
    'title': title,
    'opportunityType': 'TRAINING',
    'status': 'APPLICATIONS_OPEN',
  },
  'mentor': {'userId': 'm1', 'displayName': 'Rafiq H.'},
};

void main() {
  testWidgets('my learning applications list, page and open (R7 M6)', (
    tester,
  ) async {
    final api = FakeApi()
      ..onRequest(
        'GET /me/learning-applications',
        (request) => request.query['cursor'] == 'p2'
            ? FakeResponse.data({
                'items': [_application('a3', 'Mobile repair', 'REJECTED')],
                'nextCursor': null,
              })
            : FakeResponse.data({
                'items': [
                  _application('a1', 'House wiring', 'PENDING'),
                  _application(
                    'a2',
                    'Tailoring',
                    'ACCEPTED',
                    enrolmentId: 'e9',
                  ),
                ],
                'nextCursor': 'p2',
              }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const Scaffold(
        body: SingleChildScrollView(child: MyLearningApplicationsSection()),
      ),
      size: const Size(400, 1600),
    );
    expect(find.text('My learning applications'), findsOneWidget);
    expect(find.textContaining('Waiting'), findsOneWidget);
    expect(find.textContaining('Accepted'), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey('learning-applications-load-more')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Mobile repair'), findsOneWidget);
    expect(find.textContaining('Not accepted'), findsOneWidget);

    await tester.tap(find.text('Tailoring'));
    await tester.pumpAndSettle();
    expect(find.text('route:/learn/enrolments/e9'), findsOneWidget);
  });

  testWidgets('a pending application opens the opportunity (bn)', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /me/learning-applications',
        FakeResponse.data({
          'items': [_application('a1', 'House wiring', 'PENDING')],
          'nextCursor': null,
        }),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const Scaffold(
        body: SingleChildScrollView(child: MyLearningApplicationsSection()),
      ),
      locale: const Locale('bn'),
    );
    expect(find.text('আমার শেখার আবেদন'), findsOneWidget);
    await tester.tap(find.text('House wiring'));
    await tester.pumpAndSettle();
    expect(find.text('route:/learn/opportunities/opp-a1'), findsOneWidget);
  });

  testWidgets('an older server without the list shows nothing', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /me/learning-applications',
        FakeResponse.error(404, 'NOT_FOUND'),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const Scaffold(body: MyLearningApplicationsSection()),
    );
    expect(
      find.byKey(const ValueKey('my-learning-applications')),
      findsNothing,
    );
    expect(tester.takeException(), isNull);
  });
}

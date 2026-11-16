import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/trust_safety/presentation/attendance_screen.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _assignment({required bool poster}) => {
  'id': 'asg-1',
  'title': 'Fix the kitchen tap',
  'status': 'CONFIRMED',
  'jobStatus': 'IN_PROGRESS',
  'isWorker': !poster,
  'isPoster': poster,
  'timeline': <Object>[],
};

Map<String, dynamic> _attendance({String? checkinAt}) => {
  'session': checkinAt == null ? null : {'checkinAt': checkinAt},
  'settings': {
    'geofenceRadiusM': 300,
    'maxAccuracyM': 100,
    'consentVersion': 'location-checkin-v1',
  },
};

void main() {
  Future<FakeApi> open(
    WidgetTester tester, {
    required bool poster,
    String? checkinAt,
  }) async {
    final api = FakeApi()
      ..on(
        'GET /assignments/asg-1',
        FakeResponse.data(_assignment(poster: poster)),
      )
      ..on(
        'GET /assignments/asg-1/attendance',
        FakeResponse.data(_attendance(checkinAt: checkinAt)),
      )
      ..on('POST /assignments/asg-1/checkout-override', FakeResponse.data({}))
      ..on('POST /assignments/asg-1/checkin-override', FakeResponse.data({}));
    await pumpRouted(
      tester,
      api: api,
      // A cold deep link: the route does not say who is opening it.
      home: const AttendanceScreen(assignmentId: 'asg-1', isPoster: false),
      size: const Size(400, 1600),
    );
    return api;
  }

  testWidgets('the poster never sees the worker check-in button (N8)', (
    tester,
  ) async {
    await open(tester, poster: true);
    expect(find.text('Check in with location'), findsNothing);
    expect(find.byType(CheckboxListTile), findsNothing);
    expect(
      find.byKey(const ValueKey('attendance-confirm-start')),
      findsOneWidget,
    );
  });

  testWidgets('the worker never sees the poster override', (tester) async {
    await open(tester, poster: false);
    expect(find.byType(CheckboxListTile), findsOneWidget);
    expect(
      find.byKey(const ValueKey('attendance-confirm-start')),
      findsNothing,
    );
    expect(find.byKey(const ValueKey('attendance-confirm-end')), findsNothing);
  });

  testWidgets('the poster can confirm the end of the work (N1)', (
    tester,
  ) async {
    final api = await open(
      tester,
      poster: true,
      checkinAt: '2026-11-16T04:00:00Z',
    );
    await tester.tap(find.byKey(const ValueKey('attendance-confirm-end')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField),
      'No site pin; the worker finished at noon.',
    );
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();

    final sent = api.called('POST /assignments/asg-1/checkout-override');
    expect(sent, hasLength(1));
    expect((sent.single.data! as Map)['reason'], contains('No site pin'));
    expect(api.called('POST /assignments/asg-1/checkin-override'), isEmpty);
  });
}

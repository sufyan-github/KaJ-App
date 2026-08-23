import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/analytics/analytics_dispatcher.dart';

void main() {
  test('analytics accepts typed non-PII parameters', () async {
    final sink = _RecordingSink();
    final dispatcher = AnalyticsDispatcher(sink);

    await dispatcher.record(
      const AnalyticsEvent(
        name: 'auth_phone_submitted',
        parameters: {'screen': 'auth_phone'},
      ),
    );

    expect(sink.events, hasLength(1));
  });

  test('analytics rejects PII-like parameter names', () async {
    final dispatcher = AnalyticsDispatcher(_RecordingSink());

    await expectLater(
      dispatcher.record(
        const AnalyticsEvent(
          name: 'unsafe_event',
          parameters: {'phone': '+8801712345678'},
        ),
      ),
      throwsArgumentError,
    );
  });
}

class _RecordingSink implements AnalyticsSink {
  final events = <AnalyticsEvent>[];

  @override
  Future<void> record(AnalyticsEvent event) async => events.add(event);
}

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

  test('analytics drops PII-like parameters instead of throwing', () async {
    final sink = _RecordingSink();
    final rejections = <String>[];
    final dispatcher = AnalyticsDispatcher(sink, onRejected: rejections.add);

    await dispatcher.record(
      const AnalyticsEvent(
        name: 'unsafe_event',
        parameters: {'phone': '+8801712345678'},
      ),
    );

    expect(sink.events, isEmpty);
    expect(rejections.single, contains('phone'));
  });

  test('analytics drops an unnamed event', () async {
    final sink = _RecordingSink();
    final rejections = <String>[];
    final dispatcher = AnalyticsDispatcher(sink, onRejected: rejections.add);

    await dispatcher.record(const AnalyticsEvent(name: '  '));

    expect(sink.events, isEmpty);
    expect(rejections, hasLength(1));
  });

  test('a throwing sink never reaches the caller', () async {
    final rejections = <String>[];
    final dispatcher = AnalyticsDispatcher(
      _ThrowingSink(),
      onRejected: rejections.add,
    );

    await dispatcher.record(const AnalyticsEvent(name: 'job_published'));

    expect(rejections.single, contains('job_published'));
  });
}

class _RecordingSink implements AnalyticsSink {
  final events = <AnalyticsEvent>[];

  @override
  Future<void> record(AnalyticsEvent event) async => events.add(event);
}

class _ThrowingSink implements AnalyticsSink {
  @override
  Future<void> record(AnalyticsEvent event) async =>
      throw StateError('backend down');
}

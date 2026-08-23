class AnalyticsEvent {
  const AnalyticsEvent({required this.name, this.parameters = const {}});

  final String name;
  final Map<String, Object> parameters;
}

abstract interface class AnalyticsSink {
  Future<void> record(AnalyticsEvent event);
}

class AnalyticsDispatcher {
  const AnalyticsDispatcher(this._sink);

  static const _forbiddenParameterFragments = {
    'address',
    'code',
    'document',
    'email',
    'gps',
    'message',
    'nid',
    'otp',
    'phone',
    'token',
  };

  final AnalyticsSink _sink;

  Future<void> record(AnalyticsEvent event) async {
    if (event.name.trim().isEmpty) {
      throw ArgumentError.value(event.name, 'name', 'must not be empty');
    }
    for (final key in event.parameters.keys) {
      final normalized = key.toLowerCase();
      if (_forbiddenParameterFragments.any(normalized.contains)) {
        throw ArgumentError.value(key, 'parameters', 'PII is not permitted');
      }
    }
    await _sink.record(event);
  }
}

class NoopAnalyticsSink implements AnalyticsSink {
  const NoopAnalyticsSink();

  @override
  Future<void> record(AnalyticsEvent event) async {}
}

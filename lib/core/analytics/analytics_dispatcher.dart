import 'package:flutter/foundation.dart';

class AnalyticsEvent {
  const AnalyticsEvent({required this.name, this.parameters = const {}});

  final String name;
  final Map<String, Object> parameters;
}

abstract interface class AnalyticsSink {
  Future<void> record(AnalyticsEvent event);
}

/// Screens events before they leave the device.
///
/// A parameter whose key looks like it carries personal data is dropped, never
/// sent. Rejection is reported through [onRejected] — wire that to the crash
/// reporter so the mistake is visible — but it never throws: telemetry must not
/// be able to take down a user flow.
class AnalyticsDispatcher {
  const AnalyticsDispatcher(this._sink, {this.onRejected});

  static const _forbiddenParameterFragments = {
    'address',
    'code',
    'document',
    'email',
    'gps',
    'lat',
    'lng',
    'location',
    'message',
    'nid',
    'otp',
    'phone',
    'selfie',
    'token',
  };

  final AnalyticsSink _sink;

  /// Called with a human-readable reason whenever an event is discarded.
  /// Wire this to the crash reporter to notice silent telemetry loss.
  final void Function(String reason)? onRejected;

  Future<void> record(AnalyticsEvent event) async {
    final rejection = _rejectionReason(event);
    if (rejection != null) {
      onRejected?.call(rejection);
      if (kDebugMode) debugPrint('Analytics event dropped: $rejection');
      return;
    }
    try {
      await _sink.record(event);
    } on Object catch (error) {
      // A failing analytics backend is not a user-facing failure.
      onRejected?.call('sink threw for "${event.name}": $error');
    }
  }

  String? _rejectionReason(AnalyticsEvent event) {
    if (event.name.trim().isEmpty) return 'event name must not be empty';
    for (final key in event.parameters.keys) {
      final normalized = key.toLowerCase();
      if (_forbiddenParameterFragments.any(normalized.contains)) {
        return 'parameter "$key" on "${event.name}" looks like PII';
      }
    }
    return null;
  }
}

class NoopAnalyticsSink implements AnalyticsSink {
  const NoopAnalyticsSink();

  @override
  Future<void> record(AnalyticsEvent event) async {}
}

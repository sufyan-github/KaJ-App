import 'package:flutter/services.dart';

class KLocation {
  const KLocation({
    required this.latitude,
    required this.longitude,
    required this.accuracyM,
    required this.capturedAt,
    required this.mockLocation,
    this.age = Duration.zero,
  });

  final double latitude;
  final double longitude;
  final double accuracyM;
  final DateTime capturedAt;
  final bool mockLocation;

  /// How old the underlying fix was when it was read, measured against the
  /// device's elapsed-realtime clock rather than its wall clock. The native
  /// side already refuses anything stale; this is here so the server can be
  /// told, and can decide independently.
  final Duration age;
}

class LocationGateway {
  const LocationGateway();
  static const _channel = MethodChannel('app.kaaj.mobile/location');

  Future<KLocation> current() async {
    final result = await _channel.invokeMapMethod<String, dynamic>(
      'currentLocation',
    );
    if (result == null) throw StateError('Location is unavailable.');
    return KLocation(
      latitude: (result['latitude'] as num).toDouble(),
      longitude: (result['longitude'] as num).toDouble(),
      accuracyM: (result['accuracy'] as num).toDouble(),
      capturedAt: DateTime.fromMillisecondsSinceEpoch(
        (result['time'] as num).toInt(),
      ),
      mockLocation: result['mockLocation'] == true,
      age: Duration(milliseconds: (result['ageMillis'] as num?)?.toInt() ?? 0),
    );
  }
}

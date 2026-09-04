import 'package:flutter/services.dart';

class KLocation {
  const KLocation({
    required this.latitude,
    required this.longitude,
    required this.accuracyM,
    required this.capturedAt,
    required this.mockLocation,
  });

  final double latitude;
  final double longitude;
  final double accuracyM;
  final DateTime capturedAt;
  final bool mockLocation;
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
    );
  }
}

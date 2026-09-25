import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/connectivity/connectivity_service.dart';
import 'package:mocktail/mocktail.dart';

class _MockConnectivity extends Mock implements Connectivity {}

void main() {
  late _MockConnectivity connectivity;

  setUp(() {
    connectivity = _MockConnectivity();
    when(
      () => connectivity.onConnectivityChanged,
    ).thenAnswer((_) => const Stream<List<ConnectivityResult>>.empty());
  });

  void withTransport(List<ConnectivityResult> results) {
    when(
      () => connectivity.checkConnectivity(),
    ).thenAnswer((_) async => results);
  }

  test('no transport is offline without ever probing', () async {
    withTransport([ConnectivityResult.none]);
    var probes = 0;
    final service = ConnectivityService(
      connectivity,
      probe: () async {
        probes++;
        return true;
      },
    );

    expect(await service.isOnline(), isFalse);
    expect(probes, isZero);
  });

  test('a transport that cannot reach the API still reports offline', () async {
    // This is the captive-portal and dead-2G-cell case: the radio is attached,
    // so the old transport-only check claimed the app was online while every
    // request timed out behind a generic error.
    withTransport([ConnectivityResult.mobile]);
    final service = ConnectivityService(connectivity, probe: () async => false);

    expect(await service.isOnline(), isFalse);
  });

  test('a transport that reaches the API reports online', () async {
    withTransport([ConnectivityResult.mobile]);
    final service = ConnectivityService(connectivity, probe: () async => true);

    expect(await service.isOnline(), isTrue);
  });

  test('a throwing probe is treated as offline, not as an error', () async {
    withTransport([ConnectivityResult.wifi]);
    final service = ConnectivityService(
      connectivity,
      probe: () async => throw StateError('socket closed'),
    );

    expect(await service.isOnline(), isFalse);
  });

  test('repeat checks inside the cache window reuse one probe', () async {
    withTransport([ConnectivityResult.wifi]);
    var probes = 0;
    final service = ConnectivityService(
      connectivity,
      probe: () async {
        probes++;
        return true;
      },
      probeCacheWindow: const Duration(seconds: 30),
    );

    await service.isOnline();
    await service.isOnline();
    await service.isOnline();

    expect(probes, 1);
  });

  test('a successful API response short-circuits the next probe', () async {
    withTransport([ConnectivityResult.mobile]);
    var probes = 0;
    final service = ConnectivityService(
      connectivity,
      probe: () async {
        probes++;
        return false;
      },
      probeCacheWindow: const Duration(seconds: 30),
    );

    service.reportReachable();

    expect(await service.isOnline(), isTrue);
    expect(probes, isZero);
  });

  group('healthProbeUrl', () {
    test('strips the versioned API prefix', () {
      // The endpoint lives at the server root; a relative '/health' against a
      // versioned base would resolve to /api/v1/health and 404.
      expect(
        healthProbeUrl('https://kaaj-api.onrender.com/api/v1'),
        'https://kaaj-api.onrender.com/health',
      );
      expect(
        healthProbeUrl('https://api.kaaj.app/api/v1/'),
        'https://api.kaaj.app/health',
      );
      expect(
        healthProbeUrl('http://127.0.0.1:3100/api/v2'),
        'http://127.0.0.1:3100/health',
      );
    });

    test('leaves a base with no version prefix alone', () {
      expect(
        healthProbeUrl('https://api.kaaj.app'),
        'https://api.kaaj.app/health',
      );
    });
  });
}

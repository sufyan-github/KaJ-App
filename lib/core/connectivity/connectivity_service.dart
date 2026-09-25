// ignore_for_file: prefer_initializing_formals
// Dart forbids named parameters with a leading underscore, so these private
// fields have to be assigned in the initializer list.

import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/presentation/controllers/auth_providers.dart';

/// Reports whether the app can actually reach the backend.
///
/// A transport being attached is not the same as having usable internet. On
/// Bangladeshi 2G/EDGE cells, and behind hotel or campus captive portals, the
/// radio reports a connection while every request times out. Transport is
/// therefore treated as a fast hint and confirmed with a cheap probe against
/// the API before the app claims to be online.
class ConnectivityService {
  ConnectivityService(
    this._connectivity, {
    required Future<bool> Function() probe,
    Duration probeCacheWindow = const Duration(seconds: 15),
    Duration pollInterval = const Duration(seconds: 30),
  }) : _probe = probe,
       _probeCacheWindow = probeCacheWindow,
       _pollInterval = pollInterval;

  final Connectivity _connectivity;
  final Future<bool> Function() _probe;
  final Duration _probeCacheWindow;
  final Duration _pollInterval;

  bool? _lastProbeResult;
  DateTime? _lastProbeAt;
  Future<bool>? _probeInFlight;

  /// Resolves the current state, reusing a recent probe result when one exists.
  Future<bool> isOnline() async {
    if (!_hasTransport(await _connectivity.checkConnectivity())) {
      _lastProbeResult = false;
      _lastProbeAt = DateTime.now();
      return false;
    }
    return _reachable();
  }

  /// Emits on every transport change and on a slow poll, so a captive portal
  /// or a stalled cell is noticed without the user having to retry manually.
  Stream<bool> get changes {
    final controller = StreamController<bool>();
    StreamSubscription<List<ConnectivityResult>>? transport;
    Timer? poll;

    Future<void> emit({bool forceProbe = false}) async {
      if (controller.isClosed) return;
      if (forceProbe) _lastProbeAt = null;
      final online = await isOnline();
      if (!controller.isClosed) controller.add(online);
    }

    controller.onListen = () {
      transport = _connectivity.onConnectivityChanged.listen(
        (_) => emit(forceProbe: true),
      );
      poll = Timer.periodic(_pollInterval, (_) => emit(forceProbe: true));
      unawaited(emit());
    };
    controller.onCancel = () async {
      poll?.cancel();
      await transport?.cancel();
    };
    return controller.stream.distinct();
  }

  /// Marks the connection as reachable without waiting for the next probe.
  /// Any successful API response is proof, so callers can short-circuit here.
  void reportReachable() {
    _lastProbeResult = true;
    _lastProbeAt = DateTime.now();
  }

  Future<bool> _reachable() {
    final at = _lastProbeAt;
    final cached = _lastProbeResult;
    if (at != null &&
        cached != null &&
        DateTime.now().difference(at) < _probeCacheWindow) {
      return Future<bool>.value(cached);
    }
    return _probeInFlight ??= _runProbe().whenComplete(
      () => _probeInFlight = null,
    );
  }

  Future<bool> _runProbe() async {
    var reachable = false;
    try {
      reachable = await _probe();
    } on Object {
      reachable = false;
    }
    _lastProbeResult = reachable;
    _lastProbeAt = DateTime.now();
    return reachable;
  }

  bool _hasTransport(List<ConnectivityResult> results) =>
      results.isNotEmpty && !results.contains(ConnectivityResult.none);
}

final connectivityServiceProvider = Provider<ConnectivityService>((ref) {
  final dio = ref.watch(dioProvider);
  final service = ConnectivityService(
    Connectivity(),
    probe: () => _pingApi(dio),
  );
  // Any successful response is proof the network works, so ordinary traffic
  // keeps the banner honest and saves a probe. Safe to attach here: this
  // provider is rebuilt only when `dioProvider` produces a new client, so
  // interceptors cannot accumulate on the same instance.
  dio.interceptors.add(
    InterceptorsWrapper(
      onResponse: (response, handler) {
        service.reportReachable();
        handler.next(response);
      },
    ),
  );
  return service;
});

/// The health endpoint lives at the server root, not under the versioned API
/// prefix, so the probe URL is built from the origin rather than the Dio base.
/// A relative `/health` would resolve to `/api/v1/health` and 404.
String healthProbeUrl(String apiBaseUrl) {
  final origin = apiBaseUrl.replaceFirst(RegExp(r'/api/v\d+/?$'), '');
  return '$origin/health';
}

/// A deliberately tiny request. `/health` is unauthenticated, so this works
/// before sign-in, and any reply — even a 404 — proves the path is open.
Future<bool> _pingApi(Dio dio) async {
  try {
    await dio.getUri<void>(
      Uri.parse(healthProbeUrl(dio.options.baseUrl)),
      options: Options(
        receiveTimeout: const Duration(seconds: 8),
        sendTimeout: const Duration(seconds: 8),
        validateStatus: (status) => status != null,
      ),
    );
    return true;
  } on DioException catch (error) {
    // A reply of any kind means the network is usable; only transport-level
    // failures count as offline.
    return error.response != null;
  } on Object {
    return false;
  }
}

final isOnlineProvider = StreamProvider<bool>((ref) async* {
  final service = ref.watch(connectivityServiceProvider);
  yield* service.changes;
});

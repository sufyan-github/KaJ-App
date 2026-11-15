import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

/// Rotates the session and returns the new access token, or null when the
/// session could not be refreshed.
typedef AccessTokenRefresher = Future<String?> Function();

class SessionTokenStore {
  SessionTokenStore(this._storage);

  static const _refreshTokenKey = 'auth.refresh_token';
  static const _deviceIdKey = 'device.id';

  final FlutterSecureStorage _storage;
  final _expired = StreamController<void>.broadcast();
  String? _accessToken;
  AccessTokenRefresher? _refresher;

  String? get accessToken => _accessToken;

  /// Fires when the server refuses the session (refresh rejected, or a replay
  /// after a refresh is still unauthorized). The tokens are already cleared
  /// when it fires; listeners move the user back to sign-in.
  Stream<void> get sessionExpired => _expired.stream;

  void saveAccessToken(String accessToken) {
    _accessToken = accessToken;
  }

  Future<String?> readRefreshToken() => _storage.read(key: _refreshTokenKey);

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    _accessToken = accessToken;
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
  }

  Future<String> getOrCreateDeviceId() async {
    final existing = await _storage.read(key: _deviceIdKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final created = const Uuid().v4();
    await _storage.write(key: _deviceIdKey, value: created);
    return created;
  }

  Future<void> clearSession() async {
    _accessToken = null;
    await _storage.delete(key: _refreshTokenKey);
  }

  /// Clears the tokens because the server no longer accepts them, and tells
  /// [sessionExpired] listeners.
  Future<void> expireSession() async {
    await clearSession();
    if (!_expired.isClosed) _expired.add(null);
  }

  /// The HTTP client registers its single-flight refresh here so code that
  /// does not go through Dio (the chat socket) can rotate the session too.
  // ignore: use_setters_to_change_properties
  void attachRefresher(AccessTokenRefresher refresher) =>
      _refresher = refresher;

  /// Rotates the session through the HTTP client. Without a registered
  /// refresher this returns the current access token unchanged.
  Future<String?> refreshAccessToken() async {
    final refresher = _refresher;
    if (refresher == null) return _accessToken;
    return refresher();
  }
}

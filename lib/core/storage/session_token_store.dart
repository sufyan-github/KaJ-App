import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

class SessionTokenStore {
  SessionTokenStore(this._storage);

  static const _refreshTokenKey = 'auth.refresh_token';
  static const _deviceIdKey = 'device.id';

  final FlutterSecureStorage _storage;
  String? _accessToken;

  String? get accessToken => _accessToken;

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
}

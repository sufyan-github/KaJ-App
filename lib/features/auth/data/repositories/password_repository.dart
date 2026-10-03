import 'package:dio/dio.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/storage/session_token_store.dart';
import '../../domain/entities/otp_challenge.dart';

class PasswordRepository {
  const PasswordRepository(this._dio, this._tokens);
  final Dio _dio;
  final SessionTokenStore _tokens;

  Future<void> login(String phone, String password) async {
    final data = await _post('/auth/password/login', {
      'phone': phone,
      'password': password,
      'deviceId': await _tokens.getOrCreateDeviceId(),
    });
    await _tokens.saveTokens(
      accessToken: data['accessToken'] as String,
      refreshToken: data['refreshToken'] as String,
    );
  }

  Future<bool> hasPassword() async {
    try {
      final result = await _dio.get<Map<String, dynamic>>(
        '/auth/password/status',
      );
      return _data(result.data)['hasPassword'] == true;
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> setup(String password) async {
    await _post('/auth/password/setup', {'password': password});
  }

  Future<OtpChallenge> requestRecovery(String phone) async {
    final data = await _post('/auth/password/recovery/request', {
      'phone': phone,
      'subscriptionConsent': true,
    });
    return OtpChallenge(
      id: data['challengeId'] as String,
      phone: phone,
      expiresInSeconds: data['expiresIn'] as int,
    );
  }

  Future<void> reset(
    OtpChallenge challenge,
    String code,
    String password,
  ) async {
    await _post('/auth/password/recovery/verify', {
      'challengeId': challenge.id,
      'code': code,
      'password': password,
      'subscriptionConsent': true,
    });
    await _tokens.clearSession();
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body,
  ) async {
    try {
      final result = await _dio.post<Map<String, dynamic>>(path, data: body);
      return _data(result.data);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Map<String, dynamic> _data(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    if (data is Map<String, dynamic>) return data;
    throw const FormatException('Invalid authentication response');
  }
}

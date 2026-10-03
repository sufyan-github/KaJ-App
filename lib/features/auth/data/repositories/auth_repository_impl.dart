import 'package:dio/dio.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/storage/session_token_store.dart';
import '../../domain/entities/auth_result.dart';
import '../../domain/entities/otp_challenge.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_remote_data_source.dart';

class AuthRepositoryImpl implements AuthRepository {
  const AuthRepositoryImpl(this._remote, this._tokens);

  final AuthRemoteDataSource _remote;
  final SessionTokenStore _tokens;

  @override
  Future<OtpChallenge> requestOtp(String phone) async {
    try {
      final data = await _remote.requestOtp(phone);
      return OtpChallenge(
        id: data['challengeId'] as String,
        phone: phone,
        expiresInSeconds: data['expiresIn'] as int,
      );
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  @override
  Future<AuthResult> verifyOtp({
    required OtpChallenge challenge,
    required String code,
  }) async {
    try {
      final deviceId = await _tokens.getOrCreateDeviceId();
      final data = await _remote.verifyOtp(
        challengeId: challenge.id,
        code: code,
        deviceId: deviceId,
      );
      await _tokens.saveTokens(
        accessToken: data['accessToken'] as String,
        refreshToken: data['refreshToken'] as String,
      );
      return AuthResult(isNewUser: data['isNewUser'] as bool? ?? false);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  @override
  Future<bool> restoreSession() async {
    final refreshToken = await _tokens.readRefreshToken();
    if (refreshToken == null) return false;
    try {
      final data = await _remote.refresh(refreshToken);
      await _tokens.saveTokens(
        accessToken: data['accessToken'] as String,
        refreshToken: data['refreshToken'] as String,
      );
      return true;
    } on DioException catch (error) {
      if (error.response?.statusCode == 401) {
        await _tokens.clearSession();
        return false;
      }
      throw ErrorMapper.from(error);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  @override
  Future<void> logout() async {
    final refreshToken = await _tokens.readRefreshToken();
    try {
      if (refreshToken != null) await _remote.logout(refreshToken);
    } on Object {
      // Local logout must remain available when the server is unreachable.
    } finally {
      await _tokens.clearSession();
    }
  }

  @override
  Future<void> logoutAll() async {
    final refreshToken = await _tokens.readRefreshToken();
    try {
      if (refreshToken != null) await _remote.logoutAll(refreshToken);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    } finally {
      await _tokens.clearSession();
    }
  }
}

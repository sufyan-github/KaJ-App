import 'package:dio/dio.dart';

class AuthRemoteDataSource {
  const AuthRemoteDataSource(this._dio);

  final Dio _dio;

  Future<Map<String, dynamic>> requestOtp(String phone) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/otp/request',
      data: {'phone': phone},
    );
    return _unwrap(response.data);
  }

  Future<Map<String, dynamic>> verifyOtp({
    required String challengeId,
    required String code,
    required String deviceId,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/otp/verify',
      data: {'challengeId': challengeId, 'code': code, 'deviceId': deviceId},
    );
    return _unwrap(response.data);
  }

  Future<Map<String, dynamic>> refresh(String refreshToken) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/refresh',
      data: {'refreshToken': refreshToken},
    );
    return _unwrap(response.data);
  }

  Future<void> logout(String refreshToken) async {
    await _dio.post<void>('/auth/logout', data: {'refreshToken': refreshToken});
  }

  Future<void> logoutAll(String refreshToken) async {
    await _dio.post<void>(
      '/auth/logout-all',
      data: {'refreshToken': refreshToken},
    );
  }

  Map<String, dynamic> _unwrap(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    if (data is Map<String, dynamic>) return data;
    throw const FormatException(
      'The API returned an invalid success envelope.',
    );
  }
}

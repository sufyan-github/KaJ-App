import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../config/app_environment.dart';
import '../storage/session_token_store.dart';

class ApiClient {
  ApiClient({
    required AppEnvironment environment,
    required SessionTokenStore tokenStore,
    HttpClientAdapter? httpClientAdapter,
  }) {
    final options = BaseOptions(
      baseUrl: environment.apiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      headers: const {'Accept': 'application/json', 'Accept-Language': 'en'},
    );
    dio = Dio(options);
    final refreshDio = Dio(options);
    if (httpClientAdapter != null) {
      dio.httpClientAdapter = httpClientAdapter;
      refreshDio.httpClientAdapter = httpClientAdapter;
    }
    dio.interceptors.add(_SessionInterceptor(dio, refreshDio, tokenStore));
  }

  late final Dio dio;
}

class _SessionInterceptor extends QueuedInterceptor {
  _SessionInterceptor(this._client, this._refreshClient, this._tokenStore);

  static const _retriedKey = 'kaaj.auth.retried';
  static const _idempotencyHeader = 'Idempotency-Key';

  final Dio _client;
  final Dio _refreshClient;
  final SessionTokenStore _tokenStore;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers['Accept-Language'] = 'en';
    final token = _tokenStore.accessToken;
    if (token != null && !options.path.endsWith('/auth/refresh')) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    if (_isStateChanging(options.method) &&
        options.headers[_idempotencyHeader] == null) {
      options.headers[_idempotencyHeader] = const Uuid().v4();
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException error,
    ErrorInterceptorHandler handler,
  ) async {
    final request = error.requestOptions;
    final shouldRefresh =
        error.response?.statusCode == 401 &&
        request.extra[_retriedKey] != true &&
        !request.path.endsWith('/auth/refresh') &&
        !request.path.endsWith('/auth/otp/request') &&
        !request.path.endsWith('/auth/otp/verify');
    if (!shouldRefresh) {
      handler.next(error);
      return;
    }

    final refreshToken = await _tokenStore.readRefreshToken();
    if (refreshToken == null) {
      handler.next(error);
      return;
    }

    try {
      final response = await _refreshClient.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(headers: {_idempotencyHeader: const Uuid().v4()}),
      );
      final envelope = response.data;
      final data = envelope?['data'] as Map<String, dynamic>?;
      final access = data?['accessToken'] as String?;
      final rotatedRefresh = data?['refreshToken'] as String?;
      if (access == null || rotatedRefresh == null) {
        throw const FormatException('Missing token pair');
      }
      await _tokenStore.saveTokens(
        accessToken: access,
        refreshToken: rotatedRefresh,
      );
      request
        ..extra[_retriedKey] = true
        ..headers['Authorization'] = 'Bearer $access';
      handler.resolve(await _client.fetch<dynamic>(request));
    } on Object {
      await _tokenStore.clearSession();
      handler.next(error);
    }
  }

  bool _isStateChanging(String method) =>
      method == 'POST' || method == 'PUT' || method == 'PATCH';
}

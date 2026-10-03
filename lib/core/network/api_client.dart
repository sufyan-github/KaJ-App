import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../config/app_environment.dart';
import '../storage/session_token_store.dart';
import 'api_locale.dart';

class ApiClient {
  ApiClient({
    required AppEnvironment environment,
    required SessionTokenStore tokenStore,
    ApiLocale? locale,
    HttpClientAdapter? httpClientAdapter,
  }) : locale = locale ?? ApiLocale() {
    final options = BaseOptions(
      baseUrl: environment.apiBaseUrl,
      // Bangladeshi mobile networks routinely stall well past a default
      // timeout, so these are generous enough to survive a slow 3G handover
      // but short enough that a dead connection still surfaces an error.
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 40),
      sendTimeout: const Duration(seconds: 60),
      headers: {
        'Accept': 'application/json',
        'Accept-Language': this.locale.languageCode,
      },
    );
    dio = Dio(options);
    final refreshDio = Dio(options);
    if (httpClientAdapter != null) {
      dio.httpClientAdapter = httpClientAdapter;
      refreshDio.httpClientAdapter = httpClientAdapter;
    }
    dio.interceptors.add(
      _SessionInterceptor(dio, refreshDio, tokenStore, this.locale),
    );
  }

  final ApiLocale locale;
  late final Dio dio;
}

// Refresh is explicitly single-flight below. A QueuedInterceptor deadlocks when
// a replay fails: its onError waits behind the original onError awaiting it.
class _SessionInterceptor extends Interceptor {
  _SessionInterceptor(
    this._client,
    this._refreshClient,
    this._tokenStore,
    this._locale,
  );

  static const _retriedKey = 'kaaj.auth.retried';
  static const _idempotencyHeader = 'Idempotency-Key';

  final Dio _client;
  final Dio _refreshClient;
  final ApiLocale _locale;
  final SessionTokenStore _tokenStore;
  Future<String?>? _refreshInFlight;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers['Accept-Language'] = _locale.languageCode;
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
        !request.path.endsWith('/auth/otp/verify') &&
        !request.path.endsWith('/auth/password/login') &&
        !request.path.contains('/auth/password/recovery/');
    if (!shouldRefresh) {
      handler.next(error);
      return;
    }

    final refreshToken = await _tokenStore.readRefreshToken();
    if (refreshToken == null) {
      handler.next(error);
      return;
    }

    String? access;
    try {
      final requestToken = _bearerToken(request);
      final currentToken = _tokenStore.accessToken;
      access = currentToken != null && currentToken != requestToken
          ? currentToken
          : await _refreshAccessToken(refreshToken);
      if (access == null) throw const FormatException('Missing access token');
    } on DioException catch (refreshError) {
      // A timeout, lost connection or 5xx does not invalidate the credential.
      if (refreshError.response?.statusCode == 401) {
        await _tokenStore.clearSession();
      }
      handler.next(refreshError);
      return;
    } on Object {
      handler.next(error);
      return;
    }
    request
      ..extra[_retriedKey] = true
      ..headers['Authorization'] = 'Bearer $access';
    try {
      handler.resolve(await _client.fetch<dynamic>(request));
    } on DioException catch (replayError) {
      if (replayError.response?.statusCode == 401) {
        await _tokenStore.clearSession();
      }
      handler.next(replayError);
    }
  }

  String? _bearerToken(RequestOptions request) {
    final authorization = request.headers['Authorization'];
    if (authorization is! String || !authorization.startsWith('Bearer ')) {
      return null;
    }
    return authorization.substring('Bearer '.length);
  }

  Future<String?> _refreshAccessToken(String refreshToken) {
    final existing = _refreshInFlight;
    if (existing != null) return existing;
    final refresh = _performRefresh(refreshToken);
    _refreshInFlight = refresh;
    return refresh.whenComplete(() => _refreshInFlight = null);
  }

  Future<String> _performRefresh(String refreshToken) async {
    final response = await _refreshClient.post<Map<String, dynamic>>(
      '/auth/refresh',
      data: {'refreshToken': refreshToken},
      options: Options(headers: {_idempotencyHeader: const Uuid().v4()}),
    );
    final envelope = response.data;
    final rawData = envelope?['data'];
    if (rawData is! Map<String, dynamic>) {
      throw const FormatException('Missing refresh response data');
    }
    final access = rawData['accessToken'];
    final rotatedRefresh = rawData['refreshToken'];
    if (access is! String ||
        access.isEmpty ||
        rotatedRefresh is! String ||
        rotatedRefresh.isEmpty) {
      throw const FormatException('Missing token pair');
    }
    await _tokenStore.saveTokens(
      accessToken: access,
      refreshToken: rotatedRefresh,
    );
    return access;
  }

  bool _isStateChanging(String method) =>
      method == 'POST' ||
      method == 'PUT' ||
      method == 'PATCH' ||
      method == 'DELETE';
}

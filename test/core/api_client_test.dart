import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/config/app_environment.dart';
import 'package:kaaj/core/network/api_client.dart';
import 'package:kaaj/core/network/api_locale.dart';
import 'package:kaaj/core/storage/session_token_store.dart';

void main() {
  const environment = AppEnvironment(
    flavor: AppFlavor.dev,
    apiBaseUrl: 'https://mock.kaaj.test/api/v1',
    sentryDsn: '',
  );

  for (final path in [
    '/auth/password/login',
    '/auth/password/recovery/verify',
  ]) {
    test(
      '$path failures never refresh or replay a paid recovery request',
      () async {
        final store = _MemoryTokenStore(
          accessToken: 'old-access',
          refreshToken: 'old-refresh',
        );
        final adapter = _RecordingAdapter(
          (request, attempt) => _jsonResponse(401, {
            'error': {'code': 'AUTH_INVALID_CREDENTIALS', 'message': 'Invalid'},
          }),
        );
        final client = ApiClient(
          environment: environment,
          tokenStore: store,
          httpClientAdapter: adapter,
        );
        await expectLater(
          client.dio.post<void>(path, data: {'password': 'test only'}),
          throwsA(isA<DioException>()),
        );
        expect(adapter.requests.map((r) => r.path), [path]);
      },
    );
  }

  test('adds Bangla locale and an idempotency key to mutations', () async {
    final adapter = _RecordingAdapter((request, attempt) {
      return _jsonResponse(200, {
        'data': {'accepted': true},
      });
    });
    final client = ApiClient(
      environment: environment,
      tokenStore: _MemoryTokenStore(),
      httpClientAdapter: adapter,
    );

    await client.dio.post<Map<String, dynamic>>(
      '/jobs',
      data: {'title': 'Repair a fan'},
    );

    final request = adapter.requests.single;
    expect(request.headers['Accept-Language'], 'bn');
    expect(request.headers['Idempotency-Key'], isNotEmpty);
  });

  test('sends the selected English locale to every API request', () async {
    final adapter = _RecordingAdapter((request, attempt) {
      return _jsonResponse(200, {
        'data': {'accepted': true},
      });
    });
    final client = ApiClient(
      environment: environment,
      tokenStore: _MemoryTokenStore(),
      locale: ApiLocale('en'),
      httpClientAdapter: adapter,
    );

    await client.dio.get<Map<String, dynamic>>('/jobs');

    expect(adapter.requests.single.headers['Accept-Language'], 'en');
  });

  test(
    'never sends a private provider credential from the public client',
    () async {
      final adapter = _RecordingAdapter((request, attempt) {
        return _jsonResponse(200, {
          'data': {'accepted': true},
        });
      });
      final client = ApiClient(
        environment: environment,
        tokenStore: _MemoryTokenStore(),
        httpClientAdapter: adapter,
      );

      await client.dio.get<Map<String, dynamic>>('/jobs');

      expect(adapter.requests.single.headers.containsKey('X-API-Key'), isFalse);
    },
  );

  test('adds an idempotency key to DELETE requests', () async {
    final adapter = _RecordingAdapter(
      (request, attempt) => _jsonResponse(204, const {}),
    );
    final client = ApiClient(
      environment: environment,
      tokenStore: _MemoryTokenStore(),
      httpClientAdapter: adapter,
    );

    await client.dio.delete<void>('/jobs/job-1');

    expect(adapter.requests.single.headers['Idempotency-Key'], isNotEmpty);
  });

  test('rotates tokens and retries a protected request exactly once', () async {
    final tokenStore = _MemoryTokenStore(
      accessToken: 'expired-access',
      refreshToken: 'valid-refresh',
    );
    final adapter = _RecordingAdapter((request, attempt) {
      if (request.path.endsWith('/auth/refresh')) {
        expect(request.data, {'refreshToken': 'valid-refresh'});
        expect(request.headers['Accept-Language'], 'bn');
        expect(request.headers['Idempotency-Key'], isNotEmpty);
        return _jsonResponse(200, {
          'data': {
            'accessToken': 'rotated-access',
            'refreshToken': 'rotated-refresh',
          },
        });
      }
      if (request.path.endsWith('/me') && attempt == 1) {
        expect(request.headers['Authorization'], 'Bearer expired-access');
        return _jsonResponse(401, {
          'error': {'code': 'AUTH_EXPIRED'},
        });
      }
      expect(request.headers['Authorization'], 'Bearer rotated-access');
      return _jsonResponse(200, {
        'data': {'id': 'user-1'},
      });
    });
    final client = ApiClient(
      environment: environment,
      tokenStore: tokenStore,
      httpClientAdapter: adapter,
    );

    final response = await client.dio.get<Map<String, dynamic>>('/me');

    expect(response.data?['data'], {'id': 'user-1'});
    expect(tokenStore.accessToken, 'rotated-access');
    expect(await tokenStore.readRefreshToken(), 'rotated-refresh');
    expect(
      adapter.requests.where((request) => request.path.endsWith('/me')),
      hasLength(2),
    );
    expect(
      adapter.requests.where(
        (request) => request.path.endsWith('/auth/refresh'),
      ),
      hasLength(1),
    );
  });

  test('concurrent 401 responses share one rotating-token refresh', () async {
    final tokenStore = _MemoryTokenStore(
      accessToken: 'expired-access',
      refreshToken: 'valid-refresh',
    );
    final adapter = _RecordingAdapter((request, attempt) {
      if (request.path.endsWith('/auth/refresh')) {
        return _jsonResponse(200, {
          'data': {
            'accessToken': 'rotated-access',
            'refreshToken': 'rotated-refresh',
          },
        });
      }
      if (request.headers['Authorization'] == 'Bearer expired-access') {
        return _jsonResponse(401, {
          'error': {'code': 'AUTH_EXPIRED'},
        });
      }
      expect(request.headers['Authorization'], 'Bearer rotated-access');
      return _jsonResponse(200, {
        'data': {'accepted': true},
      });
    });
    final client = ApiClient(
      environment: environment,
      tokenStore: tokenStore,
      httpClientAdapter: adapter,
    );

    await Future.wait([
      client.dio.get<Map<String, dynamic>>('/protected/one'),
      client.dio.get<Map<String, dynamic>>('/protected/two'),
    ]);

    expect(
      adapter.requests.where(
        (request) => request.path.endsWith('/auth/refresh'),
      ),
      hasLength(1),
    );
  });

  test('temporary refresh outage preserves the saved session', () async {
    final store = _MemoryTokenStore(
      accessToken: 'expired-access',
      refreshToken: 'valid-refresh',
    );
    final client = ApiClient(
      environment: environment,
      tokenStore: store,
      httpClientAdapter: _RecordingAdapter(
        (request, _) =>
            _jsonResponse(request.path.endsWith('/auth/refresh') ? 503 : 401, {
              'error': {'code': 'TEMPORARY_FAILURE'},
            }),
      ),
    );
    await expectLater(
      client.dio.get<void>('/me'),
      throwsA(isA<DioException>()),
    );
    expect(await store.readRefreshToken(), 'valid-refresh');
  });

  for (final retryStatus in [401, 403, 500]) {
    test(
      'failed replay ($retryStatus) completes without interceptor deadlock',
      () async {
        final store = _MemoryTokenStore(
          accessToken: 'expired-access',
          refreshToken: 'valid-refresh',
        );
        final adapter = _RecordingAdapter((request, attempt) {
          if (request.path.endsWith('/auth/refresh')) {
            return _jsonResponse(200, {
              'data': {
                'accessToken': 'new-access',
                'refreshToken': 'new-refresh',
              },
            });
          }
          return _jsonResponse(attempt == 1 ? 401 : retryStatus, {
            'error': {'code': 'REQUEST_REJECTED'},
          });
        });
        final client = ApiClient(
          environment: environment,
          tokenStore: store,
          httpClientAdapter: adapter,
        );
        await expectLater(
          client.dio.get<void>('/me').timeout(const Duration(seconds: 2)),
          throwsA(
            isA<DioException>().having(
              (e) => e.response?.statusCode,
              'replayed response status',
              retryStatus,
            ),
          ),
        );
        expect(
          await store.readRefreshToken(),
          retryStatus == 401 ? null : 'new-refresh',
        );
        expect(
          adapter.requests.where((r) => r.path == '/auth/refresh'),
          hasLength(1),
        );
      },
    );
  }
}

class _MemoryTokenStore extends SessionTokenStore {
  _MemoryTokenStore({this._accessToken, this._refreshToken})
    : super(const FlutterSecureStorage());

  String? _accessToken;
  String? _refreshToken;

  @override
  String? get accessToken => _accessToken;

  @override
  Future<String?> readRefreshToken() async => _refreshToken;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
  }

  @override
  Future<void> clearSession() async {
    _accessToken = null;
    _refreshToken = null;
  }
}

typedef _Responder = ResponseBody Function(RequestOptions request, int attempt);

class _RecordingAdapter implements HttpClientAdapter {
  _RecordingAdapter(this._responder);

  final _Responder _responder;
  final requests = <RequestOptions>[];
  final _attempts = <String, int>{};

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final attempt = (_attempts[options.path] ?? 0) + 1;
    _attempts[options.path] = attempt;
    return _responder(options, attempt);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _jsonResponse(int statusCode, Map<String, Object> body) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

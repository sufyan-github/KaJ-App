import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

class RecordedRequest {
  const RecordedRequest(this.method, this.path, this.query, this.data);

  final Object? data;
  final String method;
  final String path;
  final Map<String, dynamic> query;

  @override
  String toString() => '$method $path';
}

class FakeResponse {
  const FakeResponse(this.status, [this.body]);

  /// A success envelope around [data].
  factory FakeResponse.data(Object? data, {int status = 200}) =>
      FakeResponse(status, {'data': data});

  /// The API error envelope.
  factory FakeResponse.error(
    int status,
    String code, {
    List<Map<String, dynamic>> details = const [],
  }) => FakeResponse(status, {
    'error': {
      'code': code,
      'message': 'Request refused',
      'details': details,
      'requestId': 'req-1',
    },
  });

  final Object? body;
  final int status;
}

/// A scripted backend. Handlers are keyed by "METHOD /path"; the most recent
/// registration wins, so a test can change an answer half way through.
class FakeApi implements HttpClientAdapter {
  final requests = <RecordedRequest>[];
  final _handlers = <String, FakeResponse Function(RecordedRequest)>{};

  void on(String route, FakeResponse response) =>
      _handlers[route] = (_) => response;

  void onRequest(
    String route,
    FakeResponse Function(RecordedRequest) handler,
  ) => _handlers[route] = handler;

  Dio dio() =>
      Dio(BaseOptions(baseUrl: 'https://kaaj.test/api/v1'))
        ..httpClientAdapter = this;

  List<RecordedRequest> called(String route) => requests
      .where((request) => '${request.method} ${request.path}' == route)
      .toList();

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final request = RecordedRequest(
      options.method,
      options.path,
      Map<String, dynamic>.from(options.queryParameters),
      options.data,
    );
    requests.add(request);
    final handler = _handlers['${options.method} ${options.path}'];
    final response = handler == null
        ? FakeResponse.error(404, 'NOT_FOUND')
        : handler(request);
    return ResponseBody.fromString(
      response.body == null ? '' : jsonEncode(response.body),
      response.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

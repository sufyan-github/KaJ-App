import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/error_mapper.dart';
import 'package:kaaj/core/errors/failure.dart';

void main() {
  test('maps malformed error envelopes without throwing', () {
    final failure = ErrorMapper.from(
      DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response<Object>(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 500,
          data: {'error': 'not-an-object'},
        ),
      ),
    );

    expect(failure.kind, FailureKind.server);
    expect(failure.retryable, isTrue);
    expect(failure.message, contains('contact support'));
  });

  test('ignores invalid optional error field types', () {
    final failure = ErrorMapper.from(
      DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response<Object>(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 422,
          data: {
            'error': {
              'message': {'en': 'Check the submitted value.'},
              'code': 123,
              'field': false,
              'requestId': [],
            },
          },
        ),
      ),
    );

    expect(failure.kind, FailureKind.validation);
    expect(failure.message, 'Check the submitted value.');
    expect(failure.code, isNull);
    expect(failure.field, isNull);
    expect(failure.requestId, isNull);
  });
}

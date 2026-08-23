import 'package:dio/dio.dart';

import 'failure.dart';

abstract final class ErrorMapper {
  static Failure from(Object error) {
    if (error is Failure) return error;
    if (error is! DioException) {
      return const Failure(
        kind: FailureKind.unknown,
        message:
            'We could not complete that request. Please try again or contact support.',
      );
    }

    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return const Failure(
        kind: FailureKind.timeout,
        message: 'The request took too long. Please try again.',
        retryable: true,
      );
    }
    if (error.type == DioExceptionType.connectionError) {
      return const Failure(
        kind: FailureKind.network,
        message: 'No internet connection. Check your connection and try again.',
        retryable: true,
      );
    }

    final status = error.response?.statusCode;
    final body = error.response?.data;
    final descriptor = body is Map<String, dynamic>
        ? body['error'] as Map<String, dynamic>?
        : null;
    final messageValue = descriptor?['message'];
    final message = switch (messageValue) {
      final String value when value.trim().isNotEmpty => value,
      final Map value when value['en'] is String => value['en'] as String,
      _ =>
        'We could not complete that request. Please try again or contact support.',
    };

    return Failure(
      kind: _kindForStatus(status),
      message: message,
      code: descriptor?['code'] as String?,
      field: descriptor?['field'] as String?,
      requestId:
          descriptor?['requestId'] as String? ??
          error.response?.headers.value('x-request-id'),
      retryable: descriptor?['retryable'] == true || (status ?? 0) >= 500,
    );
  }

  static FailureKind _kindForStatus(int? status) => switch (status) {
    401 => FailureKind.unauthorized,
    403 => FailureKind.forbidden,
    404 => FailureKind.notFound,
    409 => FailureKind.conflict,
    422 => FailureKind.validation,
    429 => FailureKind.rateLimited,
    final int value when value >= 500 => FailureKind.server,
    _ => FailureKind.unknown,
  };
}

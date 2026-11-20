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
    final rawDescriptor = body is Map ? body['error'] : null;
    final descriptor = rawDescriptor is Map
        ? Map<String, Object?>.from(rawDescriptor)
        : const <String, Object?>{};
    final messageValue = descriptor['message'];
    final message = switch (messageValue) {
      final String value when value.trim().isNotEmpty => value,
      final Map value when value['en'] is String => value['en'] as String,
      _ => genericFailureMessage,
    };
    final messageBn = switch (messageValue) {
      final Map value when value['bn'] is String => value['bn'] as String,
      final String value when RegExp(r'[\u0980-\u09FF]').hasMatch(value) =>
        value,
      _ => null,
    };

    return Failure(
      kind: _kindForStatus(status),
      message: message,
      code: descriptor['code'] is String ? descriptor['code'] as String : null,
      field: descriptor['field'] is String
          ? descriptor['field'] as String
          : null,
      requestId:
          (descriptor['requestId'] is String
              ? descriptor['requestId'] as String
              : null) ??
          error.response?.headers.value('x-request-id'),
      retryable: descriptor['retryable'] == true || (status ?? 0) >= 500,
      details: _details(descriptor['details']),
      messageBn: messageBn,
      messageKey: descriptor['messageKey'] is String
          ? descriptor['messageKey'] as String
          : null,
      actionType: switch (descriptor['action']) {
        final Map action when action['type'] is String =>
          action['type'] as String,
        _ => null,
      },
    );
  }

  static List<Map<String, Object?>> _details(Object? value) => value is List
      ? value
            .whereType<Map>()
            .map(Map<String, Object?>.from)
            .toList(growable: false)
      : const [];

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

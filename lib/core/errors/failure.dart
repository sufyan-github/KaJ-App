enum FailureKind {
  network,
  timeout,
  unauthorized,
  forbidden,
  validation,
  notFound,
  conflict,
  rateLimited,
  server,
  unknown,
}

class Failure implements Exception {
  const Failure({
    required this.kind,
    required this.message,
    this.code,
    this.field,
    this.requestId,
    this.retryable = false,
    this.details = const [],
  });

  final FailureKind kind;
  final String message;
  final String? code;
  final String? field;
  final String? requestId;
  final bool retryable;

  /// Structured extras from the error envelope, for example carrier SMS
  /// instructions. Only map entries are kept.
  final List<Map<String, Object?>> details;

  @override
  String toString() => 'Failure($kind, $code, $requestId)';
}

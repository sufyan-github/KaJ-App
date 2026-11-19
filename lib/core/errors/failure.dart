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

/// What [ErrorMapper] says when the server gave no message.
const genericFailureMessage =
    'We could not complete that request. Please try again or contact support.';

class Failure implements Exception {
  const Failure({
    required this.kind,
    required this.message,
    this.code,
    this.field,
    this.requestId,
    this.retryable = false,
    this.details = const [],
    this.messageBn,
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

  /// The server's Bangla text, when it sent one next to [message].
  final String? messageBn;

  /// The server's own reason with its code, for an error the app has no
  /// copy for: "Approved identity verification is required. (FORBIDDEN)".
  /// Null for connection problems, server faults and the generic fallback.
  String? serverReason({required bool bangla}) {
    final code = this.code;
    if (code == null ||
        kind == FailureKind.network ||
        kind == FailureKind.timeout ||
        kind == FailureKind.server) {
      return null;
    }
    final text = (bangla ? messageBn : null) ?? message;
    if (text.trim().isEmpty || text == genericFailureMessage) return '($code)';
    return '${text.trim()} ($code)';
  }

  @override
  String toString() => 'Failure($kind, $code, $requestId)';
}

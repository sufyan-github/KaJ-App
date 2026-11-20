import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../core/config/app_environment.dart';
import '../../../core/errors/failure.dart';
import '../../../core/storage/session_token_store.dart';
import '../domain/chat_models.dart';

/// How the realtime link is doing, so the thread can say so instead of quietly
/// going deaf.
enum ChatConnectionState { connecting, connected, reconnecting, offline }

/// Gets the socket a usable token after the server refused one.
///
/// The chat server checks the token only during the handshake. When it is
/// stale it answers `chat:error UNAUTHORIZED` and disconnects, and Socket.IO
/// does not retry a server-side disconnect. With no HTTP traffic nothing else
/// rotates the session, so the socket would stay "reconnecting" forever.
class ChatTokenRecovery {
  ChatTokenRecovery(this._tokens, {this.maxAttempts = 3});

  final SessionTokenStore _tokens;

  /// Refusals in a row, without a successful handshake, before giving up.
  final int maxAttempts;
  int _attempts = 0;

  /// A token to retry with after [rejected] was refused, or null to stop.
  Future<String?> tokenAfterRejection(String? rejected) async {
    if (_attempts >= maxAttempts) return null;
    _attempts++;
    final current = _tokens.accessToken;
    // The HTTP layer already rotated the session since the socket was built.
    if (current != null && current != rejected) return current;
    final refreshed = await _tokens.refreshAccessToken();
    return refreshed == null || refreshed == rejected ? null : refreshed;
  }

  /// The server accepted the token.
  void accepted() => _attempts = 0;
}

/// Turns the payload of the socket `exception` event into a [Failure].
///
/// The server sends `{code, message, messageKey, httpStatus, …}` when a
/// handler refuses (not a member, blocked, restricted account), and
/// `{status: "error", message: "Unauthorized."}` for an expired session.
/// Returns null for the session case, which is handled by re-authenticating.
Failure? socketExceptionFailure(Object? payload) {
  if (payload is! Map) {
    return const Failure(
      kind: FailureKind.unknown,
      message: genericFailureMessage,
    );
  }
  final code = payload['code'];
  final message = payload['message'];
  if (code is! String) {
    if (payload['status'] == 'error' &&
        message is String &&
        message.toLowerCase().contains('unauthorized')) {
      return null;
    }
  }
  final status = payload['httpStatus'];
  return Failure(
    kind: switch (status) {
      403 => FailureKind.forbidden,
      404 => FailureKind.notFound,
      409 => FailureKind.conflict,
      400 || 422 => FailureKind.validation,
      429 => FailureKind.rateLimited,
      final int value when value >= 500 => FailureKind.server,
      _ =>
        code is String && code.startsWith('ACCOUNT_')
            ? FailureKind.forbidden
            : FailureKind.unknown,
    },
    message: message is String && message.trim().isNotEmpty
        ? message
        : genericFailureMessage,
    code: code is String ? code : null,
    field: payload['field'] is String ? payload['field'] as String : null,
  );
}

class ChatRealtimeService {
  ChatRealtimeService(this._environment, this._tokens)
    : _recovery = ChatTokenRecovery(_tokens);

  final AppEnvironment _environment;
  final SessionTokenStore _tokens;
  final ChatTokenRecovery _recovery;
  final _messages = StreamController<ChatMessage>.broadcast();
  final _connection = StreamController<ChatConnectionState>.broadcast();
  final _errors = StreamController<Failure>.broadcast();

  io.Socket? _socket;
  String? _conversationId;
  String? _socketToken;
  bool _disposed = false;
  bool _recovering = false;
  ChatConnectionState _state = ChatConnectionState.offline;

  Stream<ChatMessage> get messages => _messages.stream;

  /// Refusals the server sent on the socket (`exception` event), such as
  /// joining a conversation you were removed from.
  Stream<Failure> get errors => _errors.stream;

  Stream<ChatConnectionState> get connection => _connection.stream;

  ChatConnectionState get state => _state;

  void connect(String conversationId) {
    if (_disposed) return;
    disconnect();
    _recovery.accepted();
    _conversationId = conversationId;
    _emit(ChatConnectionState.connecting);
    _open(conversationId, _tokens.accessToken);
  }

  void _open(String conversationId, String? token) {
    final base = _environment.apiBaseUrl.replaceFirst(
      RegExp(r'/api/v1/?$'),
      '',
    );
    _socketToken = token;
    final socket = io.io(
      '$base/chat',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionDelay(500)
          .setReconnectionDelayMax(8000)
          .disableAutoConnect()
          .build(),
    );
    _socket = socket
      ..onConnect((_) {
        _emit(ChatConnectionState.connected);
        socket.emit('conversation:join', {'conversationId': conversationId});
      })
      ..on('chat:ready', (_) => _recovery.accepted())
      ..on('chat:message', (dynamic value) {
        if (value is Map) {
          _messages.add(ChatMessage.fromJson(Map<String, dynamic>.from(value)));
        }
      })
      ..on('chat:error', (dynamic value) {
        final code = value is Map ? value['code'] : null;
        if (code == 'UNAUTHORIZED') unawaited(_recoverAuth());
      })
      ..on('exception', (dynamic value) {
        final failure = socketExceptionFailure(value);
        if (failure == null) {
          unawaited(_recoverAuth());
        } else if (!_errors.isClosed) {
          _errors.add(failure);
        }
      })
      // A transport failure (offline, server restarting): keep Socket.IO's
      // own retries, but with the newest token the HTTP layer holds.
      ..onConnectError((_) => _reattachToken())
      ..onError((_) => _reattachToken())
      ..onDisconnect((dynamic reason) {
        // The server hung up on us (it does so after a refused token) and
        // Socket.IO will not retry that on its own.
        if (reason == 'io server disconnect') {
          unawaited(_recoverAuth());
        } else {
          _emit(ChatConnectionState.reconnecting);
        }
      })
      ..connect();
  }

  void _reattachToken() {
    if (_disposed) return;
    _emit(ChatConnectionState.reconnecting);
    final socket = _socket;
    final token = _tokens.accessToken;
    if (socket == null || token == null) {
      _emit(ChatConnectionState.offline);
      return;
    }
    _socketToken = token;
    socket.auth = {'token': token};
  }

  Future<void> _recoverAuth() async {
    final conversationId = _conversationId;
    if (_disposed || _recovering || conversationId == null) return;
    _recovering = true;
    _emit(ChatConnectionState.reconnecting);
    try {
      final token = await _recovery.tokenAfterRejection(_socketToken);
      if (_disposed || _conversationId != conversationId) return;
      _socket?.dispose();
      _socket = null;
      if (token == null) {
        // The session could not be renewed. If the server refused it, the
        // HTTP layer has already ended the session and sign-in follows.
        _emit(ChatConnectionState.offline);
        return;
      }
      _open(conversationId, token);
    } finally {
      _recovering = false;
    }
  }

  /// Re-attaches the current token and reconnects. Call this after the HTTP
  /// layer has rotated the session, so realtime recovers with it.
  void refreshSession() {
    final conversationId = _conversationId;
    if (_disposed || conversationId == null) return;
    connect(conversationId);
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _emit(ChatConnectionState.offline);
  }

  void dispose() {
    _disposed = true;
    _socket?.dispose();
    _socket = null;
    _messages.close();
    _connection.close();
    _errors.close();
  }

  void _emit(ChatConnectionState next) {
    if (_disposed || _state == next) return;
    _state = next;
    if (!_connection.isClosed) _connection.add(next);
  }
}

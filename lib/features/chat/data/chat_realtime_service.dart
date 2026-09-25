import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../core/config/app_environment.dart';
import '../../../core/storage/session_token_store.dart';
import '../domain/chat_models.dart';

/// How the realtime link is doing, so the thread can say so instead of quietly
/// going deaf.
enum ChatConnectionState { connecting, connected, reconnecting, offline }

class ChatRealtimeService {
  ChatRealtimeService(this._environment, this._tokens);

  final AppEnvironment _environment;
  final SessionTokenStore _tokens;
  final _messages = StreamController<ChatMessage>.broadcast();
  final _connection = StreamController<ChatConnectionState>.broadcast();

  io.Socket? _socket;
  String? _conversationId;
  bool _disposed = false;
  ChatConnectionState _state = ChatConnectionState.offline;

  Stream<ChatMessage> get messages => _messages.stream;

  Stream<ChatConnectionState> get connection => _connection.stream;

  ChatConnectionState get state => _state;

  void connect(String conversationId) {
    if (_disposed) return;
    disconnect();
    _conversationId = conversationId;
    _emit(ChatConnectionState.connecting);
    _open(conversationId);
  }

  void _open(String conversationId) {
    final base = _environment.apiBaseUrl.replaceFirst(
      RegExp(r'/api/v1/?$'),
      '',
    );
    final socket = io.io(
      '$base/chat',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': _tokens.accessToken})
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
      ..on('chat:message', (dynamic value) {
        if (value is Map) {
          _messages.add(ChatMessage.fromJson(Map<String, dynamic>.from(value)));
        }
      })
      // The auth payload is captured when the socket is built. Once the access
      // token expires the server rejects every reconnection attempt with the
      // same dead credential, so the token has to be re-read and re-attached
      // rather than retried unchanged.
      ..onConnectError((_) => _reauthenticate())
      ..onError((_) => _reauthenticate())
      ..onDisconnect((_) => _emit(ChatConnectionState.reconnecting))
      ..connect();
  }

  void _reauthenticate() {
    if (_disposed) return;
    _emit(ChatConnectionState.reconnecting);
    final socket = _socket;
    final token = _tokens.accessToken;
    if (socket == null || token == null) {
      _emit(ChatConnectionState.offline);
      return;
    }
    socket.auth = {'token': token};
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
  }

  void _emit(ChatConnectionState next) {
    if (_disposed || _state == next) return;
    _state = next;
    if (!_connection.isClosed) _connection.add(next);
  }
}

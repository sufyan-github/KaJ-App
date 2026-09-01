import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../core/config/app_environment.dart';
import '../../../core/storage/session_token_store.dart';
import '../domain/chat_models.dart';

class ChatRealtimeService {
  ChatRealtimeService(this._environment, this._tokens);

  final AppEnvironment _environment;
  final SessionTokenStore _tokens;
  final _messages = StreamController<ChatMessage>.broadcast();
  io.Socket? _socket;

  Stream<ChatMessage> get messages => _messages.stream;

  void connect(String conversationId) {
    disconnect();
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
        socket.emit('conversation:join', {'conversationId': conversationId});
      })
      ..on('chat:message', (dynamic value) {
        if (value is Map) {
          _messages.add(ChatMessage.fromJson(Map<String, dynamic>.from(value)));
        }
      })
      ..connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }

  void dispose() {
    disconnect();
    _messages.close();
  }
}

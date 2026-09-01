import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../../../bootstrap.dart';
import '../../../../core/connectivity/connectivity_service.dart';
import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../data/chat_realtime_service.dart';
import '../../data/chat_repository.dart';
import '../../domain/chat_models.dart';

final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) =>
      ChatRepository(ref.watch(dioProvider), Hive.box<dynamic>('kaaj_chat')),
);

final conversationsProvider = FutureProvider<List<ConversationSummary>>(
  (ref) => ref.watch(chatRepositoryProvider).conversations(),
);

final chatRealtimeProvider = Provider.autoDispose<ChatRealtimeService>((ref) {
  final service = ChatRealtimeService(
    ref.watch(appEnvironmentProvider),
    ref.watch(sessionTokenStoreProvider),
  );
  ref.onDispose(service.dispose);
  return service;
});

class ChatThreadState {
  const ChatThreadState({
    this.messages = const [],
    this.loading = true,
    this.sendingImage = false,
    this.error,
  });

  final List<ChatMessage> messages;
  final bool loading;
  final bool sendingImage;
  final String? error;

  ChatThreadState copyWith({
    List<ChatMessage>? messages,
    bool? loading,
    bool? sendingImage,
    String? error,
    bool clearError = false,
  }) => ChatThreadState(
    messages: messages ?? this.messages,
    loading: loading ?? this.loading,
    sendingImage: sendingImage ?? this.sendingImage,
    error: clearError ? null : error ?? this.error,
  );
}

class ChatThreadController extends StateNotifier<ChatThreadState> {
  ChatThreadController(
    this.conversationId,
    this._repository,
    this._realtime,
    this._connectivity,
  ) : super(const ChatThreadState()) {
    _initialize();
  }

  final String conversationId;
  final ChatRepository _repository;
  final ChatRealtimeService _realtime;
  final ConnectivityService _connectivity;
  StreamSubscription<ChatMessage>? _messageSubscription;
  StreamSubscription<bool>? _connectivitySubscription;

  Future<void> _initialize() async {
    try {
      final remote = await _repository.messages(conversationId);
      final pending = _repository
          .pending(conversationId)
          .map(
            (item) => ChatMessage(
              id: item.clientNonce,
              conversationId: conversationId,
              isMine: true,
              type: 'TEXT',
              body: item.body,
              clientNonce: item.clientNonce,
              createdAt: item.createdAt,
              delivery: ChatDelivery.sending,
            ),
          );
      state = state.copyWith(
        messages: _ordered([...remote, ...pending]),
        loading: false,
        clearError: true,
      );
      await _repository.markRead(conversationId);
      _realtime.connect(conversationId);
      _messageSubscription = _realtime.messages.listen(_merge);
      _connectivitySubscription = _connectivity.changes.listen((online) {
        if (online) _retryPending();
      });
      if (await _connectivity.isOnline()) await _retryPending();
    } on Object {
      state = state.copyWith(
        loading: false,
        error: 'বার্তাগুলো লোড করা যায়নি।',
      );
    }
  }

  Future<void> sendText(String raw) async {
    final body = raw.trim();
    if (body.isEmpty) return;
    final nonce = const Uuid().v4();
    final pending = PendingChatMessage(
      conversationId: conversationId,
      clientNonce: nonce,
      body: body,
      createdAt: DateTime.now(),
    );
    await _repository.savePending(pending);
    _merge(
      ChatMessage(
        id: nonce,
        conversationId: conversationId,
        isMine: true,
        type: 'TEXT',
        body: body,
        clientNonce: nonce,
        createdAt: pending.createdAt,
        delivery: ChatDelivery.sending,
      ),
    );
    if (await _connectivity.isOnline()) await _deliver(pending);
  }

  Future<void> sendImage(Uint8List bytes) async {
    if (!await _connectivity.isOnline()) {
      state = state.copyWith(error: 'ছবি পাঠাতে ইন্টারনেট সংযোগ প্রয়োজন।');
      return;
    }
    state = state.copyWith(sendingImage: true, clearError: true);
    try {
      _merge(await _repository.sendImage(conversationId, bytes));
    } on Object {
      state = state.copyWith(error: 'ছবিটি পাঠানো যায়নি।');
    } finally {
      state = state.copyWith(sendingImage: false);
    }
  }

  Future<void> _retryPending() async {
    for (final message in _repository.pending(conversationId)) {
      await _deliver(message);
    }
    final serverMessages = await _repository.messages(
      conversationId,
      after: _latestServerMessageId(),
    );
    for (final message in serverMessages) {
      _merge(message);
    }
  }

  Future<void> _deliver(PendingChatMessage pending) async {
    try {
      final sent = await _repository.sendText(
        conversationId,
        pending.body,
        pending.clientNonce,
      );
      await _repository.removePending(conversationId, pending.clientNonce);
      _merge(sent);
    } on Object {
      _replaceDelivery(pending.clientNonce, ChatDelivery.failed);
    }
  }

  String? _latestServerMessageId() {
    for (final message in state.messages.reversed) {
      if (message.delivery == ChatDelivery.sent &&
          (message.clientNonce == null || message.id != message.clientNonce)) {
        return message.id;
      }
    }
    return state.messages
        .where((message) => message.delivery == ChatDelivery.sent)
        .lastOrNull
        ?.id;
  }

  void _merge(ChatMessage incoming) {
    final messages = [...state.messages];
    final index = messages.indexWhere(
      (item) =>
          item.id == incoming.id ||
          (incoming.clientNonce != null &&
              item.clientNonce == incoming.clientNonce),
    );
    if (index == -1) {
      messages.add(incoming);
    } else {
      messages[index] = incoming;
    }
    state = state.copyWith(messages: _ordered(messages), clearError: true);
    if (!incoming.isMine) _repository.markRead(conversationId);
  }

  void _replaceDelivery(String nonce, ChatDelivery delivery) {
    state = state.copyWith(
      messages: state.messages
          .map(
            (message) => message.clientNonce == nonce
                ? message.copyWith(delivery: delivery)
                : message,
          )
          .toList(growable: false),
    );
  }

  List<ChatMessage> _ordered(List<ChatMessage> messages) =>
      messages..sort((a, b) => a.createdAt.compareTo(b.createdAt));

  @override
  void dispose() {
    _messageSubscription?.cancel();
    _connectivitySubscription?.cancel();
    super.dispose();
  }
}

final chatThreadProvider = StateNotifierProvider.autoDispose
    .family<ChatThreadController, ChatThreadState, String>((ref, id) {
      return ChatThreadController(
        id,
        ref.watch(chatRepositoryProvider),
        ref.watch(chatRealtimeProvider),
        ref.watch(connectivityServiceProvider),
      );
    });

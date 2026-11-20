import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../../../bootstrap.dart';
import '../../../../core/connectivity/connectivity_service.dart';
import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failure.dart';
import '../../../../core/session/user_session.dart';
import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../data/chat_realtime_service.dart';
import '../../data/chat_repository.dart';
import '../../domain/chat_models.dart';

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  ref.watch(sessionEpochProvider);
  return ChatRepository(ref.watch(dioProvider), Hive.box<dynamic>(chatBoxName));
});

final conversationsProvider = FutureProvider<List<ConversationSummary>>(
  (ref) => ref.watch(chatRepositoryProvider).conversations(),
);

/// The list entry for one conversation, when the person has it: gives a
/// thread opened from a notification its title, kind and other person.
final conversationSummaryProvider = FutureProvider.autoDispose
    .family<ConversationSummary?, String>((ref, id) async {
      final all = await ref.watch(conversationsProvider.future);
      return all.where((item) => item.id == id).firstOrNull;
    });

/// Sender names for a group chat (`subjectType|subjectId`).
final groupMemberNamesProvider = FutureProvider.autoDispose
    .family<Map<String, String>, ({String type, String id})>(
      (ref, subject) => ref
          .watch(chatRepositoryProvider)
          .memberNames(subject.type, subject.id),
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
    this.failure,
    this.hasEarlier = false,
    this.loadingEarlier = false,
  });

  final List<ChatMessage> messages;
  final bool loading;
  final bool sendingImage;
  final String? error;

  /// A refusal from the server (socket or REST) to explain with its own
  /// copy; shown in place of [error] when present.
  final Failure? failure;

  /// The first page was full, so older messages may exist.
  final bool hasEarlier;
  final bool loadingEarlier;

  ChatThreadState copyWith({
    List<ChatMessage>? messages,
    bool? loading,
    bool? sendingImage,
    String? error,
    Failure? failure,
    bool clearError = false,
    bool? hasEarlier,
    bool? loadingEarlier,
  }) => ChatThreadState(
    messages: messages ?? this.messages,
    loading: loading ?? this.loading,
    sendingImage: sendingImage ?? this.sendingImage,
    error: clearError ? null : error ?? this.error,
    failure: clearError ? null : failure ?? this.failure,
    hasEarlier: hasEarlier ?? this.hasEarlier,
    loadingEarlier: loadingEarlier ?? this.loadingEarlier,
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
  StreamSubscription<Failure>? _errorSubscription;

  /// Whether the server turned a message down for good. Lost connections,
  /// timeouts, server faults and rate limits are worth another try; a
  /// block, a removal, a restricted account or a bad request are not.
  static bool isPermanentRefusal(Object error) {
    final failure = ErrorMapper.from(error);
    return switch (failure.kind) {
      FailureKind.forbidden ||
      FailureKind.notFound ||
      FailureKind.conflict ||
      FailureKind.validation => true,
      _ => false,
    };
  }

  void dismissError() => state = state.copyWith(clearError: true);

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
        hasEarlier: remote.length >= ChatRepository.pageSize,
      );
    } on Object catch (error) {
      state = state.copyWith(
        loading: false,
        error: 'বার্তাগুলো লোড করা যায়নি।',
        failure: ErrorMapper.from(error).code == null
            ? null
            : ErrorMapper.from(error),
      );
      return;
    }
    // A failed read receipt must not hide the messages or stop realtime.
    unawaited(_markRead());
    _realtime.connect(conversationId);
    _messageSubscription = _realtime.messages.listen(_merge);
    _errorSubscription = _realtime.errors.listen(
      (failure) => state = state.copyWith(failure: failure),
    );
    _connectivitySubscription = _connectivity.changes.listen((online) {
      if (online) unawaited(_retryPending());
    });
    if (await _connectivity.isOnline()) await _retryPending();
  }

  Future<void> _markRead() async {
    try {
      await _repository.markRead(conversationId);
    } on Object {
      // Unread counts catch up on the next open.
    }
  }

  /// Loads the page of messages before the oldest one shown.
  Future<void> loadEarlier() async {
    if (state.loadingEarlier || !state.hasEarlier) return;
    final oldest = state.messages
        .where((message) => message.delivery == ChatDelivery.sent)
        .firstOrNull;
    if (oldest == null) return;
    state = state.copyWith(loadingEarlier: true);
    try {
      final older = await _repository.messages(
        conversationId,
        before: oldest.id,
      );
      state = state.copyWith(
        messages: _ordered([...older, ...state.messages]),
        hasEarlier: older.length >= ChatRepository.pageSize,
        loadingEarlier: false,
      );
    } on Object {
      state = state.copyWith(
        loadingEarlier: false,
        error: 'আগের বার্তা লোড করা যায়নি।',
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
    try {
      final serverMessages = await _repository.messages(
        conversationId,
        after: _latestServerMessageId(),
      );
      for (final message in serverMessages) {
        _merge(message);
      }
    } on Object {
      // Still offline or refused; the next reconnect tries again.
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
    } on Object catch (error) {
      if (isPermanentRefusal(error)) {
        // Never queue it again: it would be refused on every open.
        await _repository.removePending(conversationId, pending.clientNonce);
        _replaceDelivery(
          pending.clientNonce,
          ChatDelivery.refused,
          refusal: ErrorMapper.from(error),
        );
      } else {
        _replaceDelivery(pending.clientNonce, ChatDelivery.failed);
      }
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
    state = state.copyWith(messages: _ordered(messages));
    if (!incoming.isMine) unawaited(_markRead());
  }

  void _replaceDelivery(
    String nonce,
    ChatDelivery delivery, {
    Failure? refusal,
  }) {
    state = state.copyWith(
      messages: state.messages
          .map(
            (message) => message.clientNonce == nonce
                ? message.copyWith(delivery: delivery, refusal: refusal)
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
    _errorSubscription?.cancel();
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

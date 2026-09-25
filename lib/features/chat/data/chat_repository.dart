import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/chat_models.dart';

class ChatRepository {
  const ChatRepository(this._dio, this._queue);

  final Dio _dio;
  final Box<dynamic> _queue;

  Future<List<ConversationSummary>> conversations() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/conversations');
      return _items(response.data).map(ConversationSummary.fromJson).toList();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<String> openConversation({
    required String jobId,
    required String participantUserId,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/jobs/$jobId/conversations',
        data: {'participantUserId': participantUserId},
      );
      return _data(response.data)['id'] as String;
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<List<ChatMessage>> messages(
    String conversationId, {
    String? after,
  }) async {
    try {
      final query = <String, dynamic>{'limit': 100};
      if (after != null) query['after'] = after;
      final response = await _dio.get<Map<String, dynamic>>(
        '/conversations/$conversationId/messages',
        queryParameters: query,
      );
      return _items(response.data).map(ChatMessage.fromJson).toList();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<ChatMessage> sendText(
    String conversationId,
    String body,
    String clientNonce,
  ) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/conversations/$conversationId/messages',
        data: {'type': 'TEXT', 'body': body, 'clientNonce': clientNonce},
      );
      return ChatMessage.fromJson(_data(response.data));
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  /// Signs, uploads and attaches a chat photo.
  ///
  /// All three steps share one `try`, so a failure anywhere surfaces as a
  /// [Failure] like every other repository call rather than escaping as a raw
  /// [DioException] the controller cannot render. [onProgress] reports upload
  /// completion between 0 and 1 — on a slow uplink the signing step succeeds
  /// long before the bytes land, and without it the bubble sits on an
  /// indeterminate spinner with no sign of progress.
  Future<ChatMessage> sendImage(
    String conversationId,
    Uint8List source, {
    void Function(double progress)? onProgress,
  }) async {
    try {
      final compressed = await FlutterImageCompress.compressWithList(
        source,
        minWidth: 1600,
        minHeight: 1600,
        quality: 78,
        format: CompressFormat.jpeg,
      );
      final signedResponse = await _dio.post<Map<String, dynamic>>(
        '/uploads/sign',
        data: {
          'kind': 'CHAT_IMAGE',
          'mime': 'image/jpeg',
          'sizeBytes': compressed.length,
        },
      );
      final signed = _data(signedResponse.data);
      // A separate client on purpose: the pre-signed storage URL must not
      // receive the KAAJ bearer token. The timeouts are generous because this
      // is the single largest upload the app performs on a mobile uplink.
      final uploader = Dio(
        BaseOptions(
          connectTimeout: const Duration(seconds: 30),
          sendTimeout: const Duration(minutes: 3),
          receiveTimeout: const Duration(minutes: 1),
        ),
      );
      try {
        await uploader.put<void>(
          signed['uploadUrl'] as String,
          data: Stream.fromIterable([compressed]),
          onSendProgress: onProgress == null
              ? null
              : (sent, total) {
                  if (total > 0) onProgress(sent / total);
                },
          options: Options(
            headers: Map<String, dynamic>.from(
              signed['requiredHeaders'] as Map? ?? const {},
            )..['content-length'] = compressed.length,
          ),
        );
      } finally {
        uploader.close();
      }
      final completedResponse = await _dio.post<Map<String, dynamic>>(
        '/uploads/complete',
        data: {
          'kind': 'CHAT_IMAGE',
          'mime': 'image/jpeg',
          'sizeBytes': compressed.length,
          'key': signed['key'],
        },
      );
      final documentId = _data(completedResponse.data)['documentId'] as String;
      final response = await _dio.post<Map<String, dynamic>>(
        '/conversations/$conversationId/messages',
        data: {
          'type': 'IMAGE',
          'attachmentDocumentId': documentId,
          'clientNonce': const Uuid().v4(),
        },
      );
      return ChatMessage.fromJson(_data(response.data));
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> markRead(String conversationId) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/conversations/$conversationId/read',
      );
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> blockUser(String userId) async {
    try {
      await _dio.post<Map<String, dynamic>>('/users/$userId/block');
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  List<PendingChatMessage> pending(String conversationId) {
    final raw = _queue.get('pending:$conversationId');
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map(PendingChatMessage.fromJson)
        .toList(growable: false);
  }

  Future<void> savePending(PendingChatMessage message) async {
    final messages = [...pending(message.conversationId), message];
    await _queue.put(
      'pending:${message.conversationId}',
      messages.map((item) => item.toJson()).toList(growable: false),
    );
  }

  Future<void> removePending(String conversationId, String clientNonce) async {
    final messages = pending(
      conversationId,
    ).where((item) => item.clientNonce != clientNonce).toList();
    await _queue.put(
      'pending:$conversationId',
      messages.map((item) => item.toJson()).toList(growable: false),
    );
  }

  Map<String, dynamic> _data(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    if (data is Map) return Map<String, dynamic>.from(data);
    throw const FormatException('Missing response data');
  }

  List<Map<String, dynamic>> _items(Map<String, dynamic>? envelope) {
    final items = _data(envelope)['items'];
    if (items is! List) throw const FormatException('Missing response items');
    return items
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }
}

import '../../../core/errors/failure.dart';

/// `failed` will be retried; `refused` was turned down by the server for
/// good (blocked, removed, account restricted) and is never re-sent.
enum ChatDelivery { sent, sending, failed, refused }

class ConversationSummary {
  const ConversationSummary({
    required this.id,
    required this.jobTitle,
    required this.otherName,
    required this.unreadCount,
    required this.updatedAt,
    this.jobId,
    this.jobStatus,
    this.otherUserId,
    this.lastMessage,
    this.isGroup = false,
    this.subjectType,
    this.subjectId,
    this.participantCount,
  });

  factory ConversationSummary.fromJson(Map<String, dynamic> json) {
    final subject = json['subject'] is Map ? json['subject'] as Map : null;
    return ConversationSummary(
      id: json['id'] as String,
      isGroup: json['kind'] == 'GROUP',
      subjectType: subject?['type'] as String?,
      subjectId: subject?['id'] as String?,
      participantCount: (json['participantCount'] as num?)?.toInt(),
      jobId: json['jobId'] as String?,
      jobTitle: json['jobTitle'] as String? ?? 'কাজের আলোচনা',
      jobStatus: json['jobStatus'] as String?,
      otherUserId: json['otherUserId'] as String?,
      otherName: json['otherName'] as String? ?? 'KAAJ ব্যবহারকারী',
      unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
      lastMessage: json['lastMessage'] is Map
          ? ChatMessage.fromJson(Map.from(json['lastMessage'] as Map))
          : null,
      updatedAt:
          DateTime.tryParse(json['updatedAt'] as String? ?? '') ??
          DateTime.now(),
    );
  }

  final String id;

  /// A group chat (community group, session or idea room): no single
  /// other person, so no block and no person to report.
  final bool isGroup;

  /// COMMUNITY_GROUP, SESSION or IDEA_ROOM for a group chat.
  final String? subjectType;
  final String? subjectId;
  final int? participantCount;
  final String? jobId;
  final String jobTitle;
  final String? jobStatus;
  final String? otherUserId;
  final String otherName;
  final int unreadCount;
  final ChatMessage? lastMessage;
  final DateTime updatedAt;
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.isMine,
    required this.type,
    required this.createdAt,
    this.senderUserId,
    this.body,
    this.attachmentUrl,
    this.clientNonce,
    this.safetyWarning = false,
    this.delivery = ChatDelivery.sent,
    this.refusal,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
    id: json['id'] as String,
    conversationId: json['conversationId'] as String,
    senderUserId: json['senderUserId'] as String?,
    isMine: json['isMine'] == true,
    type: json['type'] as String? ?? 'TEXT',
    body: json['body'] as String?,
    attachmentUrl: json['attachmentUrl'] as String?,
    clientNonce: json['clientNonce'] as String?,
    safetyWarning: json['safetyWarning'] == true,
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
  );

  ChatMessage copyWith({ChatDelivery? delivery, Failure? refusal}) =>
      ChatMessage(
        id: id,
        conversationId: conversationId,
        senderUserId: senderUserId,
        isMine: isMine,
        type: type,
        body: body,
        attachmentUrl: attachmentUrl,
        clientNonce: clientNonce,
        safetyWarning: safetyWarning,
        createdAt: createdAt,
        delivery: delivery ?? this.delivery,
        refusal: refusal ?? this.refusal,
      );

  final String id;
  final String conversationId;
  final String? senderUserId;
  final bool isMine;
  final String type;
  final String? body;
  final String? attachmentUrl;
  final String? clientNonce;
  final bool safetyWarning;
  final DateTime createdAt;
  final ChatDelivery delivery;

  /// Why the server refused this message, for [ChatDelivery.refused].
  final Failure? refusal;
}

class PendingChatMessage {
  const PendingChatMessage({
    required this.conversationId,
    required this.clientNonce,
    required this.body,
    required this.createdAt,
  });

  factory PendingChatMessage.fromJson(Map<dynamic, dynamic> json) =>
      PendingChatMessage(
        conversationId: json['conversationId'] as String,
        clientNonce: json['clientNonce'] as String,
        body: json['body'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  Map<String, dynamic> toJson() => {
    'conversationId': conversationId,
    'clientNonce': clientNonce,
    'body': body,
    'createdAt': createdAt.toIso8601String(),
  };

  final String conversationId;
  final String clientNonce;
  final String body;
  final DateTime createdAt;
}

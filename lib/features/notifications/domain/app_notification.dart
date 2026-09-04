class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    required this.isRead,
    required this.payload,
    this.route,
    this.titleEn,
    this.bodyEn,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final rawPayload = json['payload'];
    final payload = rawPayload is Map
        ? Map<String, dynamic>.from(rawPayload)
        : const <String, dynamic>{};
    final type = json['type'] as String? ?? '';
    return AppNotification(
      id: json['id'] as String,
      type: type,
      title: _text(json['titleBn']) ?? _text(json['title']) ?? 'KAAJ আপডেট',
      body:
          _text(json['bodyBn']) ??
          _text(json['body']) ??
          'আপনার কাজের একটি নতুন আপডেট এসেছে।',
      titleEn: _text(json['titleEn']),
      bodyEn: _text(json['bodyEn']),
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      isRead: json['readAt'] != null,
      payload: payload,
      route:
          _safeRoute(json['deepLink']) ??
          _safeRoute(payload['route']) ??
          _fallbackRoute(type, payload),
    );
  }

  final String body;
  final String? bodyEn;
  final DateTime createdAt;
  final String id;
  final bool isRead;
  final Map<String, dynamic> payload;
  final String? route;
  final String title;
  final String? titleEn;
  final String type;

  String titleFor(String languageCode) =>
      languageCode == 'en' && titleEn != null ? titleEn! : title;

  String bodyFor(String languageCode) =>
      languageCode == 'en' && bodyEn != null ? bodyEn! : body;

  NotificationGroup get group => switch (type) {
    'JOB_MATCH' ||
    'SAVED_SEARCH_MATCH' ||
    'JOB_CONFIRMED' ||
    'JOB_REMINDER_24H' ||
    'JOB_REMINDER_1H' ||
    'CHECKIN_REMINDER' ||
    'WORKER_CHECKED_IN' ||
    'WORK_SUBMITTED' ||
    'COMPLETION_PENDING' ||
    'WORK_REVIEW_REMINDER' ||
    'ASSIGNMENT_CONFIRMED' ||
    'ASSIGNMENT_CANCELLED' ||
    'ASSIGNMENT_DECLINED' ||
    'BOOKING_REQUESTED' => NotificationGroup.work,
    'APPLICATION_RECEIVED' ||
    'JOB_APPLICATION_RECEIVED' ||
    'APPLICATION_ACCEPTED' ||
    'APPLICATION_REJECTED' => NotificationGroup.application,
    'PAYMENT_RELEASED' || 'PAYOUT_SENT' => NotificationGroup.payment,
    'MESSAGE_RECEIVED' || 'CHAT_MESSAGE' => NotificationGroup.message,
    _ => NotificationGroup.other,
  };
}

class NotificationInbox {
  const NotificationInbox({required this.items, required this.unreadCount});

  final List<AppNotification> items;
  final int unreadCount;
}

enum NotificationGroup { all, work, application, payment, message, other }

String? _text(Object? value) {
  if (value is! String || value.trim().isEmpty) return null;
  return value.trim();
}

String? _safeRoute(Object? value) {
  final route = _text(value);
  return route != null && route.startsWith('/') ? route : null;
}

String? _fallbackRoute(String type, Map<String, dynamic> payload) {
  final assignmentId = _text(payload['assignmentId']);
  final conversationId = _text(payload['conversationId']);
  final disputeId = _text(payload['disputeId']);

  if (assignmentId != null && _assignmentTypes.contains(type)) {
    return '/assignments/$assignmentId';
  }
  if (conversationId != null &&
      (type == 'CHAT_MESSAGE' || type == 'MESSAGE_RECEIVED')) {
    return '/conversations/$conversationId';
  }
  if (disputeId != null && type.startsWith('DISPUTE_')) {
    return '/disputes/$disputeId';
  }
  if (type.startsWith('VERIFICATION_')) return '/verification';
  if (type == 'REVIEW_RECEIVED' || type == 'REVIEW_REQUEST') {
    return '/reviews';
  }
  if (type.contains('APPLICATION')) return '/jobs';
  return null;
}

const _assignmentTypes = <String>{
  'APPLICATION_ACCEPTED',
  'ASSIGNMENT_CANCELLED',
  'ASSIGNMENT_CONFIRMED',
  'ASSIGNMENT_DECLINED',
  'BOOKING_REQUESTED',
  'COMPLETION_PENDING',
  'JOB_CONFIRMED',
  'JOB_REMINDER_1H',
  'JOB_REMINDER_24H',
  'REVIEW_REQUEST',
  'WORKER_CHECKED_IN',
  'WORK_REVIEW_REMINDER',
  'WORK_SUBMITTED',
};

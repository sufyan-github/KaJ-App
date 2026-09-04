import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/app_notification.dart';

class NotificationsRepository {
  const NotificationsRepository(this._dio);
  final Dio _dio;

  Future<NotificationInbox> getNotifications() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/notifications');
      final data = response.data?['data'];
      final items = data is Map ? data['items'] : null;
      if (items is! List) throw const FormatException('Missing notifications');
      final notifications = items
          .whereType<Map>()
          .map((item) => AppNotification.fromJson(Map.from(item)))
          .toList(growable: false);
      final unreadCount = data is Map && data['unreadCount'] is num
          ? (data['unreadCount'] as num).toInt()
          : notifications.where((item) => !item.isRead).length;
      return NotificationInbox(items: notifications, unreadCount: unreadCount);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> markRead(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>('/notifications/$id/read');
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> markAllRead() async {
    try {
      await _dio.post<Map<String, dynamic>>('/notifications/read-all');
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }
}

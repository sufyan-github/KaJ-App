import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/app_notification.dart';

class NotificationsRepository {
  const NotificationsRepository(this._dio);
  final Dio _dio;

  Future<List<AppNotification>> getNotifications() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/notifications');
      final data = response.data?['data'];
      final items = data is Map ? data['items'] : null;
      if (items is! List) throw const FormatException('Missing notifications');
      return items
          .whereType<Map>()
          .map((item) => AppNotification.fromJson(Map.from(item)))
          .toList(growable: false);
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
}

import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/settings_models.dart';

class SettingsRepository {
  const SettingsRepository(this._dio);

  final Dio _dio;

  Future<List<NotificationPreference>> notificationPreferences() => _guard(
    () async {
      final response = await _dio.get<Map<String, dynamic>>(
        '/notifications/preferences',
      );
      final items = _data(response.data)['items'];
      if (items is! List) return const [];
      return items
          .whereType<Map>()
          .map(
            (item) => NotificationPreference.fromJson(
              Map<String, dynamic>.from(item),
            ),
          )
          .where((item) => item.type.isNotEmpty)
          .toList(growable: false);
    },
  );

  Future<void> setNotificationPreference({
    required String type,
    required bool isEnabled,
    String channel = 'IN_APP',
  }) => _guard(() async {
    await _dio.put<Map<String, dynamic>>(
      '/notifications/preferences',
      data: {'channel': channel, 'type': type, 'isEnabled': isEnabled},
    );
  });

  Future<AccountSummary> accountSummary() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/auth/session');
    final user = _data(response.data)['user'];
    if (user is! Map) throw const FormatException('Missing account data');
    return AccountSummary.fromJson(Map<String, dynamic>.from(user));
  });

  /// The person's privacy choices, or null when this server does not offer
  /// privacy controls yet (an older API answers 404).
  Future<PrivacySettings?> privacy() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/profiles/me/privacy',
      );
      return PrivacySettings.fromJson(_data(response.data));
    } on DioException catch (error) {
      if (error.response?.statusCode == 404) return null;
      throw ErrorMapper.from(error);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  /// Sends only the changed fields and returns what the server stored.
  Future<PrivacySettings> updatePrivacy(Map<String, Object> changes) =>
      _guard(() async {
        final response = await _dio.put<Map<String, dynamic>>(
          '/profiles/me/privacy',
          data: changes,
        );
        return PrivacySettings.fromJson(_data(response.data));
      });

  Future<void> requestAccountDeletion() => _guard(() async {
    await _dio.delete<Map<String, dynamic>>('/me');
  });

  Future<T> _guard<T>(Future<T> Function() work) async {
    try {
      return await work();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Map<String, dynamic> _data(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    if (data is Map) return Map<String, dynamic>.from(data);
    throw const FormatException('Missing response data');
  }
}

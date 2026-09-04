import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/notifications/data/notifications_repository.dart';
import 'package:kaaj/features/notifications/domain/app_notification.dart';

void main() {
  test(
    'parses localized content, unread count, group, and deep link',
    () async {
      final adapter = _NotificationsAdapter();
      final repository = NotificationsRepository(
        Dio(BaseOptions(baseUrl: 'https://kaaj.test/api/v1'))
          ..httpClientAdapter = adapter,
      );

      final inbox = await repository.getNotifications();

      expect(inbox.unreadCount, 1);
      expect(inbox.items.single.title, 'যাচাইয়ের অনুরোধ জমা হয়েছে');
      expect(inbox.items.single.body, contains('পর্যালোচনার জন্য'));
      expect(inbox.items.single.route, '/verification');
      expect(inbox.items.single.group, NotificationGroup.other);
    },
  );

  test('calls the single and bulk read endpoints', () async {
    final adapter = _NotificationsAdapter();
    final repository = NotificationsRepository(
      Dio(BaseOptions(baseUrl: 'https://kaaj.test/api/v1'))
        ..httpClientAdapter = adapter,
    );

    await repository.markRead('notification-1');
    await repository.markAllRead();

    expect(adapter.paths, contains('/notifications/notification-1/read'));
    expect(adapter.paths, contains('/notifications/read-all'));
  });
}

class _NotificationsAdapter implements HttpClientAdapter {
  final List<String> paths = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    paths.add(options.path);
    if (options.method == 'GET') {
      return _json({
        'data': {
          'unreadCount': 1,
          'items': [
            {
              'id': 'notification-1',
              'type': 'VERIFICATION_SUBMITTED',
              'title': 'legacy title',
              'body': 'legacy body',
              'titleBn': 'যাচাইয়ের অনুরোধ জমা হয়েছে',
              'bodyBn':
                  'আপনার পরিচয় যাচাইয়ের অনুরোধ পর্যালোচনার জন্য জমা হয়েছে।',
              'deepLink': '/verification',
              'payload': {'requestId': 'request-1'},
              'readAt': null,
              'createdAt': '2026-09-05T04:30:00.000Z',
            },
          ],
        },
      });
    }
    return _json({
      'data': {'updatedCount': 1},
    });
  }

  ResponseBody _json(Map<String, dynamic> body) => ResponseBody.fromString(
    jsonEncode(body),
    200,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  @override
  void close({bool force = false}) {}
}

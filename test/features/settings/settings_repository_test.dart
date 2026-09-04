import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/settings/data/settings_repository.dart';

void main() {
  test('loads and updates notification preferences', () async {
    final adapter = _SettingsAdapter();
    final repository = SettingsRepository(
      Dio(BaseOptions(baseUrl: 'https://kaaj.test/api/v1'))
        ..httpClientAdapter = adapter,
    );

    final preferences = await repository.notificationPreferences();
    await repository.setNotificationPreference(
      type: 'CHAT_MESSAGE',
      isEnabled: false,
    );

    expect(preferences.single.type, 'CHAT_MESSAGE');
    expect(preferences.single.isEnabled, isTrue);
    final update = adapter.requests.last;
    expect(update.path, '/notifications/preferences');
    expect(update.data, containsPair('channel', 'IN_APP'));
    expect(update.data, containsPair('isEnabled', false));
  });

  test('parses a privacy-safe account summary and requests deletion', () async {
    final adapter = _SettingsAdapter();
    final repository = SettingsRepository(
      Dio(BaseOptions(baseUrl: 'https://kaaj.test/api/v1'))
        ..httpClientAdapter = adapter,
    );

    final account = await repository.accountSummary();
    await repository.requestAccountDeletion();

    expect(account.maskedPhone, '+88017•••301');
    expect(account.activeRole, 'WORKER');
    expect(adapter.requests.last.method, 'DELETE');
    expect(adapter.requests.last.path, '/me');
  });
}

class _SettingsAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final data = switch (options.path) {
      '/notifications/preferences' when options.method == 'GET' => {
        'items': [
          {'channel': 'IN_APP', 'type': 'CHAT_MESSAGE', 'isEnabled': true},
        ],
      },
      '/auth/session' => {
        'user': {
          'id': 'user-1',
          'phoneE164': '+8801700000301',
          'activeRole': 'WORKER',
          'roles': ['CUSTOMER', 'WORKER'],
        },
      },
      _ => {'ok': true},
    };
    return ResponseBody.fromString(
      jsonEncode({'data': data}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

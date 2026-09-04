import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/features/onboarding/data/onboarding_repository.dart';

void main() {
  test('loads saved rules and adds a posted job time in Dhaka time', () async {
    final adapter = _AvailabilityAdapter();
    final dio = Dio()..httpClientAdapter = adapter;
    final repository = OnboardingRepository(dio, _UnusedBox());

    final schedule = await repository.getAvailability();
    expect(schedule.rules.single.startTime, '18:00');

    await repository.addAvailabilityWindow(
      DateTime.parse('2026-09-07T03:00:00Z'),
      DateTime.parse('2026-09-07T05:00:00Z'),
    );

    final rules = adapter.savedBody?['rules'] as List<dynamic>;
    expect(rules, hasLength(2));
    expect(rules.last, containsPair('dayOfWeek', 1));
    expect(rules.last, containsPair('startTime', '09:00'));
    expect(rules.last, containsPair('endTime', '11:00'));
  });

  test(
    'reactivates worker mode and retries a forbidden availability load',
    () async {
      final adapter = _AvailabilityAdapter(forbidFirstAvailability: true);
      final repository = OnboardingRepository(
        Dio()..httpClientAdapter = adapter,
        _UnusedBox(),
      );

      final schedule = await repository.getAvailability();

      expect(schedule.rules, hasLength(1));
      expect(adapter.paths, [
        '/profiles/me/availability',
        '/me/roles/activate',
        '/profiles/me/availability',
      ]);
    },
  );
}

class _AvailabilityAdapter implements HttpClientAdapter {
  _AvailabilityAdapter({this.forbidFirstAvailability = false});

  final bool forbidFirstAvailability;
  bool _forbiddenSent = false;
  Map<String, dynamic>? savedBody;
  final List<String> paths = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    paths.add(options.path);
    if (forbidFirstAvailability &&
        !_forbiddenSent &&
        options.path == '/profiles/me/availability') {
      _forbiddenSent = true;
      return ResponseBody.fromString(
        jsonEncode({'error': 'forbidden'}),
        403,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    if (options.method == 'PUT') {
      savedBody = Map<String, dynamic>.from(options.data as Map);
    }
    if (options.path == '/me/roles/activate') {
      return ResponseBody.fromString(
        jsonEncode({
          'data': {'accessToken': 'worker-token'},
        }),
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    return ResponseBody.fromString(
      jsonEncode({
        'data': {
          'rules': [
            {
              'id': 'rule-1',
              'dayOfWeek': 0,
              'startTime': '18:00',
              'endTime': '22:00',
            },
          ],
          'exceptions': <Object>[],
        },
      }),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _UnusedBox implements Box<dynamic> {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

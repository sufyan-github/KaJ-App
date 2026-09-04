import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/jobs/data/jobs_repository.dart';

void main() {
  test('sends work type and time filters and parses compatibility', () async {
    final adapter = _JobsAdapter();
    final repository = JobsRepository(Dio()..httpClientAdapter = adapter);

    final jobs = await repository.getJobs(
      categoryId: 'category-id',
      skillId: 'skill-id',
      availableOnly: true,
    );

    expect(adapter.query['scope'], 'for-me');
    expect(adapter.query['categoryId'], 'category-id');
    expect(adapter.query['skillId'], 'skill-id');
    expect(adapter.query['availableOnly'], 'true');
    expect(jobs.single.categoryId, 'category-id');
    expect(jobs.single.isTimeAvailable, isTrue);
  });
}

class _JobsAdapter implements HttpClientAdapter {
  Map<String, dynamic> query = {};

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    query = Map<String, dynamic>.from(options.queryParameters);
    return ResponseBody.fromString(
      jsonEncode({
        'data': {
          'items': [
            {
              'id': 'job-id',
              'title': 'গণিত পড়ানো',
              'description': 'সপ্তাহে তিন দিন বাসায় পড়াতে হবে।',
              'status': 'APPLICATIONS_OPEN',
              'category': {'id': 'category-id', 'name_bn': 'শিক্ষা'},
              'location': {'name_bn': 'ধানমন্ডি'},
              'skills': <Object>[],
              'starts_at': '2026-09-07T03:00:00.000Z',
              'ends_at': '2026-09-07T05:00:00.000Z',
              'timeCompatibility': 'AVAILABLE',
              'availabilityCoverage': 1,
            },
          ],
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

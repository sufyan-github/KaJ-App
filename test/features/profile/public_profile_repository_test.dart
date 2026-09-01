import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/profile/data/public_profile_repository.dart';

void main() {
  test(
    'loads the current session then parses the D10 public projection',
    () async {
      final adapter = _ProfileAdapter();
      final dio = Dio(BaseOptions(baseUrl: 'https://kaaj.test/api/v1'))
        ..httpClientAdapter = adapter;

      final profile = await PublicProfileRepository(
        dio,
      ).getMyPublicWorkerProfile();

      expect(adapter.paths, [
        '/auth/session',
        '/users/018f4f6f-13e8-7d9a-8c2b-6b6a9f62f901/public',
      ]);
      expect(profile.displayName, 'Rahim U.');
      expect(profile.areaNameBn, 'তালাইমারি');
      expect(profile.completedJobsCount, 8);
      expect(profile.skills.single.nameBn, 'ইলেকট্রিশিয়ান');
      expect(profile.availability, ['EVENING']);
    },
  );
}

class _ProfileAdapter implements HttpClientAdapter {
  final paths = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    paths.add(options.path);
    final data = options.path == '/auth/session'
        ? {
            'user': {'id': '018f4f6f-13e8-7d9a-8c2b-6b6a9f62f901'},
          }
        : {
            'id': '018f4f6f-13e8-7d9a-8c2b-6b6a9f62f901',
            'displayName': 'Rahim U.',
            'photoUrl': null,
            'area': {'nameEn': 'Talaimari', 'nameBn': 'তালাইমারি'},
            'trustLevel': 'PHONE',
            'ratingAverage': '4.70',
            'ratingCount': 12,
            'completedJobsCount': 8,
            'skills': [
              {
                'id': 'skill-id',
                'nameBn': 'ইলেকট্রিশিয়ান',
                'level': 'ADVANCED',
                'isVerified': false,
              },
            ],
            'availability': ['EVENING'],
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

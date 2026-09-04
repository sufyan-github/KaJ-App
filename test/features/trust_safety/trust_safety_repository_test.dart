import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/location/location_gateway.dart';
import 'package:kaaj/features/trust_safety/data/trust_safety_repository.dart';

void main() {
  test(
    'parses verification, attendance, dispute and block projections',
    () async {
      final adapter = _TrustAdapter();
      final repository = TrustSafetyRepository(
        Dio(BaseOptions(baseUrl: 'https://kaaj.test/api/v1'))
          ..httpClientAdapter = adapter,
      );

      final verification = await repository.verificationRequests();
      final eligibility = await repository.applicationEligibility();
      final attendance = await repository.attendance('assignment-1');
      final disputes = await repository.disputes();
      final blocked = await repository.blockedUsers();
      final portfolio = await repository.portfolio();

      expect(verification.single.kind, 'IDENTITY');
      expect(verification.single.rejectionReason, 'ছবি ঝাপসা');
      expect(eligibility.canApply, isFalse);
      expect(eligibility.phoneVerified, isTrue);
      expect(eligibility.nidVerified, isFalse);
      expect(eligibility.selfieVerified, isFalse);
      expect(attendance.geofenceRadiusM, 300);
      expect(attendance.checkinDistanceM, 42);
      expect(disputes.single.status, 'EVIDENCE');
      expect(blocked.single.displayName, 'রহিম');
      expect(portfolio.single.categoryName, 'বৈদ্যুতিক');
    },
  );

  test(
    'check-in sends explicit consent, location and an idempotency key',
    () async {
      final adapter = _TrustAdapter();
      final repository = TrustSafetyRepository(
        Dio(BaseOptions(baseUrl: 'https://kaaj.test/api/v1'))
          ..httpClientAdapter = adapter,
      );
      final capturedAt = DateTime.utc(2026, 9, 5, 1);

      await repository.checkIn(
        'assignment-1',
        KLocation(
          latitude: 23.78,
          longitude: 90.41,
          accuracyM: 12,
          capturedAt: capturedAt,
          mockLocation: false,
        ),
        'location-checkin-v1',
      );

      final request = adapter.requests.last;
      expect(request.path, '/assignments/assignment-1/checkin');
      expect(request.headers['idempotency-key'], isNotEmpty);
      expect(request.data, containsPair('consentGranted', true));
      expect(request.data, containsPair('lat', 23.78));
      expect(
        request.data,
        containsPair('capturedAt', capturedAt.toIso8601String()),
      );
    },
  );
}

class _TrustAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final data = switch (options.path) {
      '/verification-requests/mine' => {
        'items': [
          {
            'id': 'verification-1',
            'kind': 'IDENTITY',
            'status': 'REJECTED',
            'rejectionReason': 'ছবি ঝাপসা',
            'createdAt': '2026-09-01T00:00:00.000Z',
          },
        ],
      },
      '/verification-requests/application-eligibility' => {
        'canApply': false,
        'identityStatus': 'PENDING',
        'requirements': {
          'phone': {'required': true, 'verified': true},
          'identityInformation': {'required': true, 'verified': false},
          'nid': {'required': true, 'verified': false},
          'selfie': {'required': true, 'verified': false},
        },
        'optional': {'experience': true, 'expertise': true},
      },
      '/disputes' => {
        'items': [
          {
            'id': 'dispute-1',
            'status': 'EVIDENCE',
            'reasonCode': 'POOR_QUALITY',
            'description': 'কাজের মান চুক্তির সঙ্গে মেলেনি।',
            'evidenceDueAt': '2026-09-07T00:00:00.000Z',
            'resolutionDueAt': '2026-09-10T00:00:00.000Z',
            'createdAt': '2026-09-05T00:00:00.000Z',
          },
        ],
      },
      '/me/blocks' => {
        'items': [
          {
            'userId': 'user-1',
            'displayName': 'রহিম',
            'blockedAt': '2026-09-01T00:00:00.000Z',
          },
        ],
      },
      '/profiles/me/portfolio' => {
        'items': [
          {
            'id': 'portfolio-1',
            'imageUrl': 'https://storage.test/image',
            'caption': 'ফ্যান মেরামত',
            'category': {'id': 'category-1', 'nameBn': 'বৈদ্যুতিক'},
          },
        ],
      },
      _ => {
        'id': 'session-1',
        'checkinAt': '2026-09-05T01:00:00.000Z',
        'checkinDistanceM': 42,
        'settings': {
          'geofenceRadiusM': 300,
          'maxAccuracyM': 100,
          'consentVersion': 'location-checkin-v1',
        },
      },
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

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:uuid/uuid.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/location/location_gateway.dart';
import '../domain/trust_models.dart';

class TrustSafetyRepository {
  const TrustSafetyRepository(this._dio);
  final Dio _dio;

  Future<List<VerificationRequest>> verificationRequests() async =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/verification-requests/mine',
        );
        return _items(response.data).map(VerificationRequest.fromJson).toList();
      });

  Future<void> submitVerification(String kind, List<Uint8List> images) async =>
      _guard(() async {
        final ids = <String>[];
        for (final image in images) {
          ids.add(await uploadImage('VERIFICATION_DOCUMENT', image));
        }
        await _dio.post<Map<String, dynamic>>(
          '/verification-requests',
          data: {'kind': kind, 'documentIds': ids},
        );
      });

  Future<String> uploadImage(String kind, Uint8List source) async {
    final bytes = await FlutterImageCompress.compressWithList(
      source,
      minWidth: 1800,
      minHeight: 1800,
      quality: 82,
      format: CompressFormat.jpeg,
    );
    final signedResponse = await _dio.post<Map<String, dynamic>>(
      '/uploads/sign',
      data: {'kind': kind, 'mime': 'image/jpeg', 'sizeBytes': bytes.length},
    );
    final signed = _data(signedResponse.data);
    await Dio().put<void>(
      signed['uploadUrl'] as String,
      data: Stream.fromIterable([bytes]),
      options: Options(
        headers: Map<String, dynamic>.from(
          signed['requiredHeaders'] as Map? ?? const {},
        )..['content-length'] = bytes.length,
      ),
    );
    final complete = await _dio.post<Map<String, dynamic>>(
      '/uploads/complete',
      data: {
        'kind': kind,
        'mime': 'image/jpeg',
        'sizeBytes': bytes.length,
        'key': signed['key'],
      },
    );
    return _data(complete.data)['documentId'] as String;
  }

  Future<AttendanceState> attendance(String assignmentId) async =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/assignments/$assignmentId/attendance',
        );
        return AttendanceState.fromJson(_data(response.data));
      });

  Future<AttendanceState> checkIn(
    String assignmentId,
    KLocation location,
    String consentVersion, {
    Uint8List? photo,
  }) async => _guard(() async {
    final documentId = photo == null
        ? null
        : await uploadImage('CHECKIN_PHOTO', photo);
    final response = await _dio.post<Map<String, dynamic>>(
      '/assignments/$assignmentId/checkin',
      options: Options(headers: {'idempotency-key': const Uuid().v4()}),
      data: _locationPayload(location, consentVersion)
        ..addAll({'photoDocumentId': ?documentId}),
    );
    return AttendanceState.fromJson(_data(response.data));
  });

  Future<AttendanceState> checkOut(
    String assignmentId,
    KLocation location,
    String consentVersion, {
    String? notes,
  }) async => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/assignments/$assignmentId/checkout',
      options: Options(headers: {'idempotency-key': const Uuid().v4()}),
      data: _locationPayload(location, consentVersion)
        ..addAll({
          if (notes?.trim().isNotEmpty ?? false) 'notes': notes!.trim(),
        }),
    );
    return AttendanceState.fromJson(_data(response.data));
  });

  Future<void> attendanceOverride(String assignmentId, String reason) async =>
      _guard(() async {
        await _dio.post<Map<String, dynamic>>(
          '/assignments/$assignmentId/checkin-override',
          options: Options(headers: {'idempotency-key': const Uuid().v4()}),
          data: {'reason': reason.trim()},
        );
      });

  Future<List<DisputeSummary>> disputes() async => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/disputes');
    return _items(response.data).map(DisputeSummary.fromJson).toList();
  });

  Future<DisputeSummary> dispute(String id) async => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/disputes/$id');
    return DisputeSummary.fromJson(_data(response.data));
  });

  Future<String> openDispute(
    String assignmentId,
    String reasonCode,
    String description,
  ) async => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/assignments/$assignmentId/disputes',
      data: {'reasonCode': reasonCode, 'description': description.trim()},
    );
    return _data(response.data)['id'] as String;
  });

  Future<void> addTextEvidence(String id, String text) async =>
      _guard(() async {
        await _dio.post<Map<String, dynamic>>(
          '/disputes/$id/evidence',
          data: {'kind': 'TEXT', 'text': text.trim()},
        );
      });

  Future<void> addPhotoEvidence(String id, Uint8List image) async =>
      _guard(() async {
        final documentId = await uploadImage('DISPUTE_EVIDENCE', image);
        await _dio.post<Map<String, dynamic>>(
          '/disputes/$id/evidence',
          data: {'kind': 'PHOTO', 'documentId': documentId},
        );
      });

  Future<void> appeal(String id, String reason) async => _guard(() async {
    await _dio.post<Map<String, dynamic>>(
      '/disputes/$id/appeal',
      data: {'reason': reason.trim()},
    );
  });

  Future<void> report({
    required String targetType,
    required String targetId,
    required String reasonCode,
    required String description,
  }) async => _guard(() async {
    await _dio.post<Map<String, dynamic>>(
      '/reports',
      data: {
        'targetType': targetType,
        'targetId': targetId,
        'reasonCode': reasonCode,
        'description': description.trim(),
      },
    );
  });

  Future<List<BlockedUser>> blockedUsers() async => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/me/blocks');
    return _items(response.data).map(BlockedUser.fromJson).toList();
  });

  Future<void> unblock(String userId) async => _guard(() async {
    await _dio.delete<Map<String, dynamic>>('/users/$userId/block');
  });

  Future<List<PortfolioItem>> portfolio() async => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/profiles/me/portfolio',
    );
    return _items(response.data).map(PortfolioItem.fromJson).toList();
  });

  Future<void> addPortfolioItem({
    required Uint8List image,
    required String categoryId,
    String? caption,
  }) async => _guard(() async {
    final documentId = await uploadImage('PORTFOLIO_IMAGE', image);
    await _dio.post<Map<String, dynamic>>(
      '/profiles/me/portfolio',
      data: {
        'documentId': documentId,
        'categoryId': categoryId,
        if (caption?.trim().isNotEmpty ?? false) 'caption': caption!.trim(),
      },
    );
  });

  Future<void> deletePortfolioItem(String id) async => _guard(() async {
    await _dio.delete<Map<String, dynamic>>('/profiles/me/portfolio/$id');
  });

  Map<String, dynamic> _locationPayload(
    KLocation location,
    String consentVersion,
  ) => {
    'lat': location.latitude,
    'lng': location.longitude,
    'accuracyM': location.accuracyM,
    'capturedAt': location.capturedAt.toUtc().toIso8601String(),
    'mockLocation': location.mockLocation,
    'consentGranted': true,
    'consentVersion': consentVersion,
  };

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

  List<Map<String, dynamic>> _items(Map<String, dynamic>? envelope) {
    final items = _data(envelope)['items'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }
}

import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure.dart';
import '../domain/job_models.dart';

class JobsRepository {
  const JobsRepository(this._dio);

  final Dio _dio;

  Future<List<JobSummary>> getJobs({
    String? categoryId,
    String? skillId,
    bool availableOnly = false,
    bool forMe = true,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/jobs',
        queryParameters: {
          'scope': forMe ? 'for-me' : 'all',
          'categoryId': ?categoryId,
          'skillId': ?skillId,
          if (availableOnly) 'availableOnly': 'true',
        },
      );
      return _items(response.data).map(JobSummary.fromJson).toList();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<List<JobSummary>> getMyJobs() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/jobs/mine');
      return _items(response.data).map(JobSummary.fromJson).toList();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  /// Creates a job and publishes it as one user action.
  ///
  /// This is still two calls, because the API has no combined endpoint. What
  /// changed is that both carry the *same* idempotency key: on a dropped 3G
  /// connection the poster used to see an error, retry, and create a second
  /// draft, because each call minted its own key. If publishing fails the
  /// draft id is still returned inside the failure so the caller can offer to
  /// resume it rather than orphaning it.
  Future<String> createAndPublishJob(Map<String, dynamic> payload) async {
    final actionKey = const Uuid().v4();
    String? draftId;
    try {
      final created = await _dio.post<Map<String, dynamic>>(
        '/jobs',
        data: payload,
        options: Options(headers: {'Idempotency-Key': 'job-create-$actionKey'}),
      );
      draftId = _data(created.data)['id'] as String;
      await _dio.post<Map<String, dynamic>>(
        '/jobs/$draftId/publish',
        options: Options(
          headers: {'Idempotency-Key': 'job-publish-$actionKey'},
        ),
      );
      return draftId;
    } on Object catch (error) {
      final failure = ErrorMapper.from(error);
      throw draftId == null
          ? failure
          : JobDraftPublishFailure(draftId: draftId, cause: failure);
    }
  }

  Future<void> apply({
    required String jobId,
    required DateTime startsAt,
    required DateTime endsAt,
    required int proposedPricePoisha,
    String? message,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/jobs/$jobId/applications',
        data: {
          'message': message,
          'proposedPricePoisha': proposedPricePoisha.toString(),
          'proposedStartsAt': startsAt.toUtc().toIso8601String(),
          'proposedEndsAt': endsAt.toUtc().toIso8601String(),
        },
      );
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<List<JobApplicationSummary>> getApplications(String jobId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/jobs/$jobId/applications',
      );
      return _items(response.data).map(JobApplicationSummary.fromJson).toList();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<List<SuggestedWorker>> getSuggestedWorkers(String jobId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/jobs/$jobId/suggested-workers',
      );
      return _items(response.data).map(SuggestedWorker.fromJson).toList();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> acceptApplication(String applicationId) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/applications/$applicationId/accept',
        data: const <String, dynamic>{},
      );
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<List<WorkerSlot>> getWorkerSlots(String workerId) async {
    try {
      final from = DateTime.now().toUtc();
      final to = from.add(const Duration(days: 14));
      final response = await _dio.get<Map<String, dynamic>>(
        '/workers/$workerId/availability/slots',
        queryParameters: {
          'from': from.toIso8601String(),
          'to': to.toIso8601String(),
        },
      );
      final slots = _data(response.data)['slots'];
      return slots is List
          ? slots
                .whereType<Map>()
                .map((item) => WorkerSlot.fromJson(Map.from(item)))
                .toList(growable: false)
          : const [];
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> requestBooking({
    required String workerId,
    required String title,
    required String description,
    required String categoryId,
    required String? skillId,
    required String locationId,
    required WorkerSlot slot,
    required int offeredPricePoisha,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/workers/$workerId/booking-requests',
        data: {
          'title': title,
          'description': description,
          'categoryId': categoryId,
          'skillId': skillId,
          'locationId': locationId,
          'startsAt': slot.startsAt.toUtc().toIso8601String(),
          'endsAt': slot.endsAt.toUtc().toIso8601String(),
          'offeredPricePoisha': offeredPricePoisha.toString(),
        },
      );
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<List<AssignmentSummary>> getAssignments() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/assignments');
      return _items(response.data).map(AssignmentSummary.fromJson).toList();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> confirmAssignment(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>('/assignments/$id/confirm');
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> declineAssignment(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>('/assignments/$id/decline');
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<AssignmentDetail> getAssignment(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/assignments/$id');
      return AssignmentDetail.fromJson(_data(response.data));
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> submitWork(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>('/assignments/$id/submit');
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> completeWork(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>('/assignments/$id/complete');
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> markCashPaid(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/assignments/$id/payment/cash-paid',
      );
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<AssignmentReviewState> getAssignmentReviews(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/assignments/$id/reviews',
      );
      return AssignmentReviewState.fromJson(_data(response.data));
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> submitReview({
    required String assignmentId,
    required int rating,
    required String comment,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/assignments/$assignmentId/reviews',
        data: {
          'rating': rating,
          'punctuality': rating,
          'quality': rating,
          'communication': rating,
          'reliability': rating,
          if (comment.trim().isNotEmpty) 'comment': comment.trim(),
        },
      );
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<List<AssignmentReview>> getReceivedReviews() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/reviews/received',
      );
      return _items(response.data).map(AssignmentReview.fromJson).toList();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<List<FavoriteWorker>> getFavorites() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/me/favorites');
      return _items(response.data).map(FavoriteWorker.fromJson).toList();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> setFavorite(String workerId, {required bool saved}) async {
    try {
      if (saved) {
        await _dio.post<Map<String, dynamic>>('/me/favorites/$workerId');
      } else {
        await _dio.delete<Map<String, dynamic>>('/me/favorites/$workerId');
      }
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<CancellationPreview> cancellationPreview({
    required String id,
    required String reasonCode,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/assignments/$id/cancel-preview',
        data: {'reasonCode': reasonCode},
      );
      return CancellationPreview.fromJson(_data(response.data));
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<void> cancelAssignment({
    required String id,
    required String reasonCode,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/assignments/$id/cancel',
        data: {'reasonCode': reasonCode, 'confirmed': true},
      );
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
    if (items is! List) throw const FormatException('Missing response items');
    return items
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }
}

/// Raised when a job was created but could not be published. The draft exists
/// server-side, so the UI can offer to retry publishing instead of losing the
/// form the poster just filled in.
class JobDraftPublishFailure implements Exception {
  const JobDraftPublishFailure({required this.draftId, required this.cause});

  final Failure cause;
  final String draftId;

  @override
  String toString() => 'JobDraftPublishFailure($draftId, $cause)';
}

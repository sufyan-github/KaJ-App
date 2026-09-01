import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/job_models.dart';

class JobsRepository {
  const JobsRepository(this._dio);

  final Dio _dio;

  Future<List<JobSummary>> getJobs() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/jobs',
        queryParameters: const {'scope': 'for-me'},
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

  Future<String> createAndPublishJob(Map<String, dynamic> payload) async {
    try {
      final created = await _dio.post<Map<String, dynamic>>(
        '/jobs',
        data: payload,
      );
      final id = _data(created.data)['id'] as String;
      await _dio.post<Map<String, dynamic>>('/jobs/$id/publish');
      return id;
    } on Object catch (error) {
      throw ErrorMapper.from(error);
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

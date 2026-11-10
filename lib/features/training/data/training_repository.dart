import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure.dart';
import '../domain/training_models.dart';

/// The 409 the API returns after three failed tests inside 24 hours.
///
/// [nextAttemptAt] comes from the error `details`, so the screen can say when
/// the worker may try again instead of a bare "not now".
class TrainingAttemptLimitFailure extends Failure {
  const TrainingAttemptLimitFailure({
    required super.message,
    this.nextAttemptAt,
    super.requestId,
  }) : super(kind: FailureKind.conflict, code: trainingAttemptLimitCode);

  final DateTime? nextAttemptAt;
}

const trainingAttemptLimitCode = 'TRAINING_ATTEMPT_LIMIT';
const trainingAlreadyCertifiedCode = 'TRAINING_ALREADY_CERTIFIED';

enum CourseScope { mine, all }

class TrainingRepository {
  const TrainingRepository(this._dio);

  final Dio _dio;

  Future<List<CourseSummary>> courses({CourseScope scope = CourseScope.mine}) =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/training/courses',
          queryParameters: {'scope': scope.name},
        );
        return _items(response.data).map(CourseSummary.fromJson).toList();
      });

  Future<CourseDetail> course(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/training/courses/$id',
    );
    return CourseDetail.fromJson(_data(response.data));
  });

  /// Records a private checklist tick. It never earns anything.
  Future<void> openLesson(String lessonId) => _guard(() async {
    await _dio.post<void>('/training/lessons/$lessonId/open');
  });

  Future<TrainingAttempt> startAttempt(String courseId) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/training/courses/$courseId/attempts',
    );
    return TrainingAttempt.fromJson(_data(response.data));
  });

  Future<TestResult> submitAttempt(
    String attemptId,
    Map<String, String> answers,
  ) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/training/attempts/$attemptId/submit',
      data: {
        'answers': answers.entries
            .map((entry) => {'questionId': entry.key, 'optionId': entry.value})
            .toList(growable: false),
      },
    );
    return TestResult.fromJson(_data(response.data));
  });

  Future<List<CertificateSummary>> myCertificates() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/me/certificates');
    return _items(response.data).map(CertificateSummary.fromJson).toList();
  });

  Future<T> _guard<T>(Future<T> Function() work) async {
    try {
      return await work();
    } on Object catch (error) {
      final failure = ErrorMapper.from(error);
      if (failure.code == trainingAttemptLimitCode) {
        throw TrainingAttemptLimitFailure(
          message: failure.message,
          requestId: failure.requestId,
          nextAttemptAt: error is DioException ? _nextAttemptAt(error) : null,
        );
      }
      throw failure;
    }
  }

  static DateTime? _nextAttemptAt(DioException error) {
    final body = error.response?.data;
    final descriptor = body is Map ? body['error'] : null;
    final details = descriptor is Map ? descriptor['details'] : null;
    if (details is! List) return null;
    for (final detail in details.whereType<Map>()) {
      final value = detail['nextAttemptAt'];
      if (value is String) return DateTime.tryParse(value);
    }
    return null;
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

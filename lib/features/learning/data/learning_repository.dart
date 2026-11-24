import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/network/paged_list.dart';
import '../../jobs/domain/job_models.dart';
import '../domain/learning_models.dart';

/// KAAJ Learn opportunities (`/learning-opportunities`). Free: never
/// behind the subscription.
class LearningRepository {
  const LearningRepository(this._dio);

  final Dio _dio;

  Future<List<LearningOpportunity>> feed({
    LearningKind? kind,
    ParticipantTerms? terms,
    DeliveryMode? mode,
    String? skillId,
    String? locationId,
    String? cursor,
  }) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/learning-opportunities',
      queryParameters: {
        'opportunityType': ?kind?.wire,
        'participantTerms': ?terms?.wire,
        'workArrangement': ?mode?.wire,
        'skillId': ?skillId,
        'locationId': ?locationId,
        'cursor': ?cursor,
      },
    );
    return PagedList(
      _items(response.data),
      nextCursor: PagedList.cursorFrom(response.data),
    );
  });

  /// One page of the feed for [filter]; [cursor] asks for a later page.
  Future<List<LearningOpportunity>> feedPage(
    LearningFilter filter, {
    String? cursor,
  }) => feed(
    kind: filter.kind,
    terms: filter.terms,
    mode: filter.mode,
    skillId: filter.skillId,
    locationId: filter.locationId,
    cursor: cursor,
  );

  /// The mentors own opportunities, drafts included.
  Future<List<LearningOpportunity>> mine() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/learning-opportunities/mine',
    );
    return _items(response.data);
  });

  Future<LearningOpportunity> detail(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/learning-opportunities/$id',
    );
    return LearningOpportunity.fromJson(_data(response.data));
  });

  /// Creates the opportunity and publishes it as one action. If publishing
  /// fails the draft stays and can be published from the mentors list.
  Future<LearningOpportunity> createAndPublish(LearningDraft draft) =>
      _guard(() async {
        final created = await _dio.post<Map<String, dynamic>>(
          '/learning-opportunities',
          data: draft.toJson(),
        );
        final opportunity = LearningOpportunity.fromJson(_data(created.data));
        if (opportunity.status == 'APPLICATIONS_OPEN' ||
            opportunity.status == 'PUBLISHED') {
          return opportunity;
        }
        return publish(opportunity.id);
      });

  Future<LearningOpportunity> publish(String id) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/learning-opportunities/$id/publish',
    );
    final data = response.data?['data'];
    return data is Map && data['id'] is String
        ? LearningOpportunity.fromJson(Map<String, dynamic>.from(data))
        : detail(id);
  });

  /// Stops new applications (`POST /learning-opportunities/:id/close`): a
  /// draft or an opportunity nobody is enrolled in is closed; with learners
  /// enrolled only applications stop. Else 409 JOB_NOT_CLOSABLE.
  Future<void> close(String id) => _guard(() async {
    await _dio.post<Map<String, dynamic>>('/learning-opportunities/$id/close');
  });

  Future<void> apply(String id, {String? message}) => _guard(() async {
    await _dio.post<Map<String, dynamic>>(
      '/learning-opportunities/$id/applications',
      data: {
        if (message != null && message.trim().isNotEmpty)
          'message': message.trim(),
      },
    );
  });

  // ---- P1.3: applications, enrolments and sessions ----

  Future<List<LearningApplication>> applications(String opportunityId) =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/learning-opportunities/$opportunityId/applications',
        );
        final items = _data(response.data)['items'];
        return items is List
            ? items
                  .whereType<Map>()
                  .map(
                    (item) => LearningApplication.fromJson(
                      Map<String, dynamic>.from(item),
                    ),
                  )
                  .toList(growable: false)
            : const [];
      });

  Future<void> acceptApplication(String applicationId) => _guard(() async {
    await _dio.post<Map<String, dynamic>>(
      '/learning-applications/$applicationId/accept',
    );
  });

  Future<void> declineApplication(String applicationId) => _guard(() async {
    await _dio.post<Map<String, dynamic>>(
      '/learning-applications/$applicationId/decline',
    );
  });

  /// My own learning applications, newest first, one page at a time.
  Future<List<MyLearningApplication>> myApplications({String? cursor}) =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/me/learning-applications',
          queryParameters: {'cursor': ?cursor},
        );
        final items = _data(response.data)['items'];
        return PagedList(
          items is List
              ? items
                    .whereType<Map>()
                    .map(
                      (item) => MyLearningApplication.fromJson(
                        Map<String, dynamic>.from(item),
                      ),
                    )
                    .toList(growable: false)
              : const <MyLearningApplication>[],
          nextCursor: PagedList.cursorFrom(response.data),
        );
      });

  Future<List<LearningEnrolment>> enrolments() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/learning-enrolments',
    );
    final items = _data(response.data)['items'];
    return items is List
        ? items
              .whereType<Map>()
              .map(
                (item) =>
                    LearningEnrolment.fromJson(Map<String, dynamic>.from(item)),
              )
              .toList(growable: false)
        : const [];
  });

  Future<LearningEnrolment> enrolment(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/learning-enrolments/$id',
    );
    return LearningEnrolment.fromJson(_data(response.data));
  });

  Future<LearningEnrolment> recordSession(
    String enrolmentId, {
    required DateTime heldAt,
    required int minutes,
    required String topic,
    String? notes,
  }) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/learning-enrolments/$enrolmentId/sessions',
      data: {
        'heldAt': heldAt.toUtc().toIso8601String(),
        'minutes': minutes,
        'topic': topic.trim(),
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      },
    );
    return LearningEnrolment.fromJson(_data(response.data));
  });

  Future<LearningEnrolment> confirmSession(String sessionId) =>
      _guard(() async {
        final response = await _dio.post<Map<String, dynamic>>(
          '/learning-sessions/$sessionId/confirm',
        );
        return LearningEnrolment.fromJson(_data(response.data));
      });

  /// P1.4: the mentor marks the learning complete and issues the practical
  /// certificate.
  Future<LearningEnrolment> complete(String enrolmentId) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/learning-enrolments/$enrolmentId/complete',
    );
    return LearningEnrolment.fromJson(_data(response.data));
  });

  // ---- P1 leftovers: withdrawal and reviews of learning ----

  /// Takes back an application (before acceptance). After acceptance use
  /// [withdrawEnrolment].
  Future<void> withdrawApplication(String applicationId, {String? reason}) =>
      _guard(() async {
        await _dio.post<Map<String, dynamic>>(
          '/learning-applications/$applicationId/withdraw',
          data: {
            if (reason != null && reason.trim().isNotEmpty)
              'reason': reason.trim(),
          },
        );
      });

  /// The learner leaves; no penalty and the seat is freed.
  Future<LearningEnrolment> withdrawEnrolment(
    String enrolmentId, {
    String? reason,
  }) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/learning-enrolments/$enrolmentId/withdraw',
      data: {
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
    );
    return LearningEnrolment.fromJson(_data(response.data));
  });

  /// Review state of a finished learning, double blind like job reviews.
  Future<AssignmentReviewState> reviewState(String enrolmentId) =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/reviews/subject',
          queryParameters: {
            'subjectType': 'LEARNING_ENROLMENT',
            'subjectId': enrolmentId,
          },
        );
        return AssignmentReviewState.fromJson(_data(response.data));
      });

  Future<void> submitReview(String enrolmentId, ReviewInput review) =>
      _guard(() async {
        await _dio.post<Map<String, dynamic>>(
          '/reviews',
          data: {
            'subjectType': 'LEARNING_ENROLMENT',
            'subjectId': enrolmentId,
            ...review.toJson(),
          },
        );
      });

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
    throw const FormatException('Missing learning data');
  }

  List<LearningOpportunity> _items(Map<String, dynamic>? envelope) {
    final items = _data(envelope)['items'];
    if (items is! List) throw const FormatException('Missing learning items');
    return items
        .whereType<Map>()
        .map(
          (item) =>
              LearningOpportunity.fromJson(Map<String, dynamic>.from(item)),
        )
        .toList(growable: false);
  }
}

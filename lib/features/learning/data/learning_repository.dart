import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/network/paged_list.dart';
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

  Future<void> apply(String id, {String? message}) => _guard(() async {
    await _dio.post<Map<String, dynamic>>(
      '/learning-opportunities/$id/applications',
      data: {
        if (message != null && message.trim().isNotEmpty)
          'message': message.trim(),
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

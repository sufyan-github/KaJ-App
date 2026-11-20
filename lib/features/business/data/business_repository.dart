import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/network/paged_list.dart';
import '../domain/business_models.dart';

/// Business profiles, members, offerings, verification, the partner
/// directory and collaboration requests (backend P2.1 to P2.6). Business is
/// free; what the person may not see answers 404.
class BusinessRepository {
  const BusinessRepository(this._dio);

  final Dio _dio;

  // ------------------------------------------------------------- profiles

  Future<List<BusinessRef>> categories() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/business-categories',
    );
    return [
      for (final item in _items(response.data)) ?BusinessRef.tryParse(item),
    ];
  });

  Future<MyBusinesses> mine() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/me/businesses');
    return MyBusinesses.fromJson(_data(response.data));
  });

  Future<Business> detail(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/businesses/$id');
    return Business.fromJson(_data(response.data));
  });

  /// [fields] holds only the documented create or update fields.
  Future<Business> create(Map<String, Object?> fields) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/businesses',
      data: fields,
    );
    return Business.fromJson(_data(response.data));
  });

  Future<Business> update(String id, Map<String, Object?> fields) =>
      _guard(() async {
        final response = await _dio.patch<Map<String, dynamic>>(
          '/businesses/$id',
          data: fields,
        );
        return Business.fromJson(_data(response.data));
      });

  Future<void> delete(String id) =>
      _guard(() => _dio.delete<Map<String, dynamic>>('/businesses/$id'));

  Future<void> acceptInvitation(String id) => _guard(
    () => _dio.post<Map<String, dynamic>>('/businesses/$id/membership/accept'),
  );

  /// Leaves a business, or declines an invitation to it.
  Future<void> leave(String id) => _guard(
    () => _dio.delete<Map<String, dynamic>>('/businesses/$id/membership'),
  );

  // -------------------------------------------------------------- members

  Future<List<BusinessMember>> members(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/businesses/$id/members',
    );
    return businessMembersFrom(response.data?['data']);
  });

  Future<List<BusinessMember>> invite(
    String id, {
    required String userId,
    required BusinessRole role,
  }) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/businesses/$id/members',
      data: {'userId': userId, 'role': role.wire},
    );
    return businessMembersFrom(response.data?['data']);
  });

  Future<List<BusinessMember>> changeRole(
    String id,
    String userId,
    BusinessRole role,
  ) => _guard(() async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '/businesses/$id/members/$userId',
      data: {'role': role.wire},
    );
    return businessMembersFrom(response.data?['data']);
  });

  Future<List<BusinessMember>> removeMember(String id, String userId) =>
      _guard(() async {
        final response = await _dio.delete<Map<String, dynamic>>(
          '/businesses/$id/members/$userId',
        );
        return businessMembersFrom(response.data?['data']);
      });

  // ------------------------------------------------------------ offerings

  Future<List<Offering>> offerings(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/businesses/$id/offerings',
    );
    return _items(response.data).map(Offering.fromJson).toList();
  });

  Future<Offering> createOffering(String id, Map<String, Object?> fields) =>
      _guard(() async {
        final response = await _dio.post<Map<String, dynamic>>(
          '/businesses/$id/offerings',
          data: fields,
        );
        return Offering.fromJson(_data(response.data));
      });

  Future<Offering> updateOffering(
    String id,
    String offeringId,
    Map<String, Object?> fields,
  ) => _guard(() async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '/businesses/$id/offerings/$offeringId',
      data: fields,
    );
    return Offering.fromJson(_data(response.data));
  });

  Future<void> deleteOffering(String id, String offeringId) => _guard(
    () => _dio.delete<Map<String, dynamic>>(
      '/businesses/$id/offerings/$offeringId',
    ),
  );

  Future<List<BusinessJob>> jobs(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/businesses/$id/jobs',
    );
    return _items(response.data).map(BusinessJob.fromJson).toList();
  });

  // --------------------------------------------------------- verification

  Future<BusinessVerification> verification(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/businesses/$id/verification',
    );
    return BusinessVerification.fromJson(_data(response.data));
  });

  Future<BusinessVerification> submitVerification(
    String id,
    List<String> documentIds,
  ) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/businesses/$id/verification',
      data: {'documentIds': documentIds},
    );
    return BusinessVerification.fromJson(_data(response.data));
  });

  // ------------------------------------------------------------- partners

  Future<PagedList<Business>> partners(
    PartnerFilter filter, {
    String? cursor,
  }) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/partners',
      queryParameters: filter.query(cursor: cursor),
    );
    return PagedList(
      _items(response.data).map(Business.fromJson).toList(),
      nextCursor: PagedList.cursorFrom(response.data),
    );
  });

  // -------------------------------------------------------- collaboration

  /// [box] is `received` or `sent`.
  Future<CollaborationPage> collaborations(String box, {String? cursor}) =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/collaboration-requests',
          queryParameters: {'box': box, 'cursor': ?cursor},
        );
        final data = _data(response.data);
        return CollaborationPage(
          items: PagedList(
            _items(response.data).map(Collaboration.fromJson).toList(),
            nextCursor: PagedList.cursorFrom(response.data),
          ),
          notice: BnEn.fromJson(data['notice']),
        );
      });

  Future<Collaboration> collaboration(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/collaboration-requests/$id',
    );
    return Collaboration.fromJson(_data(response.data));
  });

  Future<Collaboration> requestCollaboration({
    required String subjectType,
    required String subjectId,
    required String message,
    String? fromBusinessId,
    String? ideaRoleId,
  }) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/collaboration-requests',
      data: {
        'subjectType': subjectType,
        'subjectId': subjectId,
        'message': message.trim(),
        'fromBusinessId': ?fromBusinessId,
        'ideaRoleId': ?ideaRoleId,
      },
    );
    return Collaboration.fromJson(_data(response.data));
  });

  Future<Collaboration> act(
    String id,
    CollaborationAction action, {
    String? note,
    String? summary,
  }) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/collaboration-requests/$id/${action.path}',
      data: {
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        if (action == CollaborationAction.agree &&
            summary != null &&
            summary.trim().isNotEmpty)
          'summary': summary.trim(),
      },
    );
    return Collaboration.fromJson(_data(response.data));
  });

  // -------------------------------------------------------------- helpers

  Future<T> _guard<T>(Future<T> Function() run) async {
    try {
      return await run();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Map<String, dynamic> _data(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    if (data is Map) return Map<String, dynamic>.from(data);
    throw const FormatException('Missing business data');
  }

  List<Map<String, dynamic>> _items(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    final items = data is Map ? data['items'] : data;
    return items is List
        ? items.whereType<Map>().map(Map<String, dynamic>.from).toList()
        : const [];
  }
}

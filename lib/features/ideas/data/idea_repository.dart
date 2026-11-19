import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/network/paged_list.dart';
import '../domain/idea_models.dart';

/// Ideas (`/ideas`, `/me/ideas`, `/me/idea-access`). Free for everyone.
/// Anything the viewer may not see answers 404.
class IdeaRepository {
  const IdeaRepository(this._dio);

  final Dio _dio;

  /// Business sectors (`GET /business-categories`).
  Future<List<IdeaNamed>> sectors() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/business-categories',
    );
    return _items(response.data, IdeaNamed.fromJson);
  });

  /// One page of public idea cards.
  Future<List<Idea>> search(IdeaFilter filter, {String? cursor}) =>
      _guard(() async {
        final q = filter.q?.trim();
        final response = await _dio.get<Map<String, dynamic>>(
          '/ideas',
          queryParameters: {
            'categoryId': ?filter.categoryId,
            'locationId': ?filter.locationId,
            'stage': ?filter.stage,
            'roleType': ?filter.roleType,
            if (q != null && q.length >= 2) 'q': q,
            'cursor': ?cursor,
          },
        );
        return PagedList(
          _items(response.data, Idea.fromJson),
          nextCursor: PagedList.cursorFrom(response.data),
        );
      });

  Future<MyIdeas> mine() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/me/ideas');
    return MyIdeas.fromJson(_data(response.data));
  });

  Future<List<MyIdeaAccess>> myAccess() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/me/idea-access');
    return _items(response.data, MyIdeaAccess.fromJson);
  });

  Future<Idea> detail(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/ideas/$id');
    return Idea.fromJson(_data(response.data));
  });

  Future<Idea> create(IdeaDraft draft) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/ideas',
      data: draft.toCreateJson(),
    );
    return Idea.fromJson(_data(response.data));
  });

  Future<Idea> update(String id, Map<String, dynamic> patch) =>
      _guard(() async {
        final response = await _dio.patch<Map<String, dynamic>>(
          '/ideas/$id',
          data: patch,
        );
        return Idea.fromJson(_data(response.data));
      });

  Future<void> delete(String id) => _guard(() async {
    await _dio.delete<Map<String, dynamic>>('/ideas/$id');
  });

  // ---- access to the private details ----

  Future<IdeaAccessState> requestAccess(String id, {String? message}) =>
      _guard(() async {
        final response = await _dio.post<Map<String, dynamic>>(
          '/ideas/$id/access-requests',
          data: {
            'acceptConfidentiality': true,
            if (message != null && message.trim().isNotEmpty)
              'message': message.trim(),
          },
        );
        return IdeaAccessState.fromJson(_data(response.data));
      });

  Future<List<IdeaAccessRequest>> accessRequests(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/ideas/$id/access-requests',
    );
    return _items(response.data, IdeaAccessRequest.fromJson);
  });

  /// [action] is approve, decline or revoke.
  Future<List<IdeaAccessRequest>> decideAccess(
    String id,
    String userId,
    String action,
  ) => _guard(() async {
    final path = action == 'revoke'
        ? '/ideas/$id/access/$userId/revoke'
        : '/ideas/$id/access-requests/$userId/$action';
    final response = await _dio.post<Map<String, dynamic>>(path);
    return _items(response.data, IdeaAccessRequest.fromJson);
  });

  Future<List<IdeaView>> views(String id, {String? cursor}) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/ideas/$id/views',
      queryParameters: {'cursor': ?cursor},
    );
    return PagedList(
      _items(response.data, IdeaView.fromJson),
      nextCursor: PagedList.cursorFrom(response.data),
    );
  });

  // ---- roles and matches ----

  Future<void> createRole(String id, IdeaRoleDraft draft) => _guard(() async {
    await _dio.post<Map<String, dynamic>>(
      '/ideas/$id/roles',
      data: draft.toCreateJson(),
    );
  });

  Future<void> updateRole(String id, String roleId, IdeaRoleDraft draft) =>
      _guard(() async {
        await _dio.patch<Map<String, dynamic>>(
          '/ideas/$id/roles/$roleId',
          data: draft.toPatchJson(),
        );
      });

  Future<void> deleteRole(String id, String roleId) => _guard(() async {
    await _dio.delete<Map<String, dynamic>>('/ideas/$id/roles/$roleId');
  });

  Future<IdeaRoleMatches> matches(String id, String roleId) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/ideas/$id/roles/$roleId/matches',
    );
    return IdeaRoleMatches.fromJson(_data(response.data));
  });

  /// Interest in the idea (and in one of its roles): a collaboration
  /// request about the idea, sent to the owner.
  Future<IdeaCollaboration> sendInterest(
    String id, {
    String? roleId,
    required String message,
  }) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/collaboration-requests',
      data: {
        'subjectType': 'IDEA',
        'subjectId': id,
        'ideaRoleId': ?roleId,
        'message': message.trim(),
      },
    );
    return IdeaCollaboration.fromJson(_data(response.data));
  });

  // ---- team, room and conversion ----

  Future<IdeaTeam> team(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/ideas/$id/members');
    return IdeaTeam.fromJson(_data(response.data));
  });

  /// Agreed collaborations about this idea: the people who can join.
  Future<List<IdeaCollaboration>> agreedCollaborations(String id) =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/collaboration-requests',
          queryParameters: {
            'box': 'received',
            'subjectType': 'IDEA',
            'subjectId': id,
            'status': 'AGREED',
          },
        );
        return _items(response.data, IdeaCollaboration.fromJson);
      });

  Future<IdeaTeam> addMember(
    String id,
    String collaborationRequestId, {
    String? roleLabel,
  }) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/ideas/$id/members',
      data: {
        'collaborationRequestId': collaborationRequestId,
        if (roleLabel != null && roleLabel.trim().isNotEmpty)
          'roleLabel': roleLabel.trim(),
      },
    );
    return IdeaTeam.fromJson(_data(response.data));
  });

  /// The owner removes [userId], or a member removes themself (leaves).
  Future<void> removeMember(String id, String userId) => _guard(() async {
    await _dio.delete<Map<String, dynamic>>('/ideas/$id/members/$userId');
  });

  /// The team group chat; returns its conversation id (null if the server
  /// could not open it).
  Future<String?> room(String id) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>('/ideas/$id/room');
    final value = _data(response.data)['conversationId'];
    return value is String && value.isNotEmpty ? value : null;
  });

  /// Turns the idea into a business; returns the new business id.
  Future<String> convert(
    String id, {
    required String stage,
    String? name,
    String? tradeLicenceNo,
  }) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/ideas/$id/convert',
      data: {
        'stage': stage,
        if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
        if (tradeLicenceNo != null && tradeLicenceNo.trim().isNotEmpty)
          'tradeLicenceNo': tradeLicenceNo.trim(),
      },
    );
    final data = _data(response.data);
    final business = data['business'];
    final businessId = business is Map ? business['id'] : null;
    if (businessId is String && businessId.isNotEmpty) return businessId;
    final idea = data['idea'];
    final converted = idea is Map ? idea['convertedBusinessId'] : null;
    if (converted is String && converted.isNotEmpty) return converted;
    throw const FormatException('Missing business id');
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
    throw const FormatException('Missing idea data');
  }

  List<T> _items<T>(
    Map<String, dynamic>? envelope,
    T Function(Map<String, dynamic>) read,
  ) {
    final items = _data(envelope)['items'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((item) => read(Map<String, dynamic>.from(item)))
        .toList(growable: false);
  }
}

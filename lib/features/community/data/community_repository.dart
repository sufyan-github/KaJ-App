import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/location/location_gateway.dart';
import '../../../core/network/paged_list.dart';
import '../domain/community_models.dart';

/// The consent version the server expects for a session check-in. No
/// endpoint exposes it, so it is fixed here (same as job check-in).
const sessionCheckInConsentVersion = 'location-checkin-v1';

/// Experts and Community: introductions, consultations and sessions, and
/// community groups. Free for everyone.
class CommunityRepository {
  const CommunityRepository(this._dio);

  final Dio _dio;

  // ---- Introductions ----

  Future<Introduction> sendIntroduction(IntroductionDraft draft) =>
      _guard(() async {
        final response = await _dio.post<Map<String, dynamic>>(
          '/introductions',
          data: draft.toJson(),
        );
        return Introduction.fromJson(_data(response.data));
      });

  /// [box] is `sent` or `received`.
  Future<List<Introduction>> introductions(String box, {String? cursor}) =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/introductions',
          queryParameters: {'box': box, 'cursor': ?cursor},
        );
        return _page(response.data, Introduction.fromJson);
      });

  Future<Introduction> introduction(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/introductions/$id');
    return Introduction.fromJson(_data(response.data));
  });

  Future<Introduction> acceptIntroduction(
    String id, {
    required bool acceptConfidentiality,
  }) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/introductions/$id/accept',
      data: {if (acceptConfidentiality) 'acceptConfidentiality': true},
    );
    return Introduction.fromJson(_data(response.data));
  });

  Future<Introduction> declineIntroduction(String id, {String? reason}) =>
      _guard(() async {
        final response = await _dio.post<Map<String, dynamic>>(
          '/introductions/$id/decline',
          data: {
            if (reason != null && reason.trim().isNotEmpty)
              'reason': reason.trim(),
          },
        );
        return Introduction.fromJson(_data(response.data));
      });

  Future<Introduction> withdrawIntroduction(String id) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/introductions/$id/withdraw',
    );
    return Introduction.fromJson(_data(response.data));
  });

  /// Ideas the person owns or is on the team of (`GET /me/ideas`).
  Future<List<ContextChoice>> myIdeas() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/me/ideas');
    final data = _data(response.data);
    ContextChoice choice(Map<String, dynamic> json, bool owned) =>
        ContextChoice(
          id: json['id'] as String? ?? '',
          title: json['title'] as String? ?? '',
          owned: owned,
        );
    return [
      for (final item in _list(data['owned'])) choice(item, true),
      for (final item in _list(data['team'])) choice(item, false),
    ].where((item) => item.id.isNotEmpty).toList(growable: false);
  });

  /// Businesses the person is an accepted member of.
  Future<List<ContextChoice>> myBusinesses() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/me/businesses');
    return [
      for (final item in _list(_data(response.data)['items']))
        ContextChoice(
          id: item['id'] as String? ?? '',
          title: item['name'] as String? ?? '',
        ),
    ].where((item) => item.id.isNotEmpty).toList(growable: false);
  });

  // ---- Consultations and sessions ----

  Future<List<ExpertSlot>> expertSlots(
    String expertUserId, {
    required DateTime from,
    required DateTime to,
  }) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/experts/$expertUserId/slots',
      queryParameters: {
        'from': from.toUtc().toIso8601String(),
        'to': to.toUtc().toIso8601String(),
      },
    );
    return _list(
      _data(response.data)['slots'],
    ).map(ExpertSlot.fromJson).whereType<ExpertSlot>().toList(growable: false);
  });

  Future<CommunitySession> bookConsultation(ConsultationRequest request) =>
      _session(
        () => _dio.post('/sessions/consultations', data: request.toJson()),
      );

  /// [role] is `hosting` or `attending`.
  Future<List<CommunitySession>> sessions(String role, {String? cursor}) =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/sessions',
          queryParameters: {'role': role, 'cursor': ?cursor},
        );
        return _page(response.data, CommunitySession.fromJson);
      });

  Future<CommunitySession> session(String id) =>
      _session(() => _dio.get('/sessions/$id'));

  Future<CommunitySession> createSession(SessionDraft draft) =>
      _session(() => _dio.post('/sessions', data: draft.toCreateJson()));

  Future<CommunitySession> updateSession(
    String id,
    SessionDraft draft, {
    bool includeWomenOnly = true,
  }) => _session(
    () => _dio.patch(
      '/sessions/$id',
      data: draft.toUpdateJson(includeWomenOnly: includeWomenOnly),
    ),
  );

  Future<CommunitySession> publishSession(String id) =>
      _session(() => _dio.post('/sessions/$id/publish'));

  Future<CommunitySession> inviteToSession(String id, List<String> userIds) =>
      _session(
        () => _dio.post('/sessions/$id/invite', data: {'userIds': userIds}),
      );

  /// Accept or decline an invitation. The expert of a consultation also
  /// sets the online link and the price when accepting.
  Future<CommunitySession> respondToSession(
    String id, {
    required bool accept,
    String? onlineLink,
    String? priceModel,
    String? pricePoisha,
  }) => _session(
    () => _dio.post(
      '/sessions/$id/respond',
      data: {
        'accept': accept,
        if (accept && onlineLink != null && onlineLink.trim().isNotEmpty)
          'onlineLink': onlineLink.trim(),
        if (accept) 'priceModel': ?priceModel,
        if (accept && priceModel == 'CASH') 'pricePoisha': ?pricePoisha,
      },
    ),
  );

  Future<CommunitySession> rsvp(String id) =>
      _session(() => _dio.post('/sessions/$id/rsvp'));

  Future<CommunitySession> leaveSession(String id) =>
      _session(() => _dio.post('/sessions/$id/leave'));

  Future<CommunitySession> cancelSession(String id, String reason) => _session(
    () => _dio.post('/sessions/$id/cancel', data: {'reason': reason.trim()}),
  );

  Future<CommunitySession> completeSession(String id) =>
      _session(() => _dio.post('/sessions/$id/complete'));

  Future<CommunitySession> markAttendance(
    String id,
    String userId, {
    required bool attended,
  }) => _session(
    () => _dio.post(
      '/sessions/$id/attendance',
      data: {'userId': userId, 'status': attended ? 'ATTENDED' : 'NO_SHOW'},
    ),
  );

  Future<CommunitySession> recordCash(
    String id,
    String userId,
    String amountPoisha,
  ) => _session(
    () => _dio.post(
      '/sessions/$id/cash',
      data: {'userId': userId, 'amountPoisha': amountPoisha},
    ),
  );

  Future<CommunitySession> checkIn(String id, KLocation location) => _session(
    () => _dio.post(
      '/sessions/$id/check-in',
      data: {
        'lat': double.parse(location.latitude.toStringAsFixed(6)),
        'lng': double.parse(location.longitude.toStringAsFixed(6)),
        'accuracyM': double.parse(location.accuracyM.toStringAsFixed(2)),
        'consentGranted': true,
        'consentVersion': sessionCheckInConsentVersion,
        'capturedAt': location.capturedAt.toUtc().toIso8601String(),
        'mockLocation': location.mockLocation,
      },
    ),
  );

  /// Opens (or reuses) the session group chat; returns its conversation id.
  Future<String?> sessionChat(String id) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/sessions/$id/chat',
    );
    return _data(response.data)['conversationId'] as String?;
  });

  Future<SessionFeedbackState> sessionFeedback(String id) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/reviews/subject',
      queryParameters: {'subjectType': 'SESSION', 'subjectId': id},
    );
    return SessionFeedbackState.fromJson(_data(response.data));
  });

  Future<void> sendSessionFeedback(String id, Map<String, dynamic> review) =>
      _guard(() async {
        await _dio.post<Map<String, dynamic>>(
          '/reviews',
          data: {'subjectType': 'SESSION', 'subjectId': id, ...review},
        );
      });

  /// The worker directory, to pick people to invite.
  Future<List<PersonChoice>> people() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>('/users/workers');
    return _list(_data(response.data)['items'])
        .map(PersonChoice.fromJson)
        .where((item) => item.userId.isNotEmpty)
        .toList(growable: false);
  });

  // ---- Community groups ----

  Future<List<CommunityGroup>> searchGroups({
    String? q,
    String? locationId,
    bool womenOnly = false,
    String? cursor,
  }) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/community/groups',
      queryParameters: {
        if (q != null && q.trim().length >= 2) 'q': q.trim(),
        'locationId': ?locationId,
        if (womenOnly) 'womenOnly': 'true',
        'cursor': ?cursor,
      },
    );
    return _page(response.data, CommunityGroup.fromJson);
  });

  Future<List<CommunityGroup>> myGroups() => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/me/community/groups',
    );
    return _list(
      _data(response.data)['items'],
    ).map(CommunityGroup.fromJson).toList(growable: false);
  });

  Future<CommunityGroup> group(String id) =>
      _group(() => _dio.get('/community/groups/$id'));

  Future<CommunityGroup> createGroup(GroupDraft draft) =>
      _group(() => _dio.post('/community/groups', data: draft.toCreateJson()));

  Future<CommunityGroup> updateGroup(String id, GroupDraft draft) => _group(
    () => _dio.patch('/community/groups/$id', data: draft.toUpdateJson()),
  );

  Future<CommunityGroup> joinGroup(String id) =>
      _group(() => _dio.post('/community/groups/$id/join'));

  Future<void> leaveGroup(String id) => _guard(() async {
    await _dio.post<Map<String, dynamic>>('/community/groups/$id/leave');
  });

  /// [status] is `ACTIVE` or `PENDING` (moderators only).
  Future<List<GroupMember>> members(
    String groupId, {
    String status = 'ACTIVE',
    String? cursor,
  }) => _guard(() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/community/groups/$groupId/members',
      queryParameters: {
        if (status != 'ACTIVE') 'status': status,
        'cursor': ?cursor,
      },
    );
    return _page(response.data, GroupMember.fromJson);
  });

  /// Returns the ids that were actually invited.
  Future<List<String>> inviteToGroup(String groupId, List<String> userIds) =>
      _guard(() async {
        final response = await _dio.post<Map<String, dynamic>>(
          '/community/groups/$groupId/members',
          data: {'userIds': userIds},
        );
        final invited = _data(response.data)['invited'];
        return invited is List
            ? invited.whereType<String>().toList(growable: false)
            : const [];
      });

  Future<void> approveMember(String groupId, String userId) => _guard(() async {
    await _dio.post<Map<String, dynamic>>(
      '/community/groups/$groupId/members/$userId/approve',
    );
  });

  Future<void> setMemberRole(String groupId, String userId, String role) =>
      _guard(() async {
        await _dio.patch<Map<String, dynamic>>(
          '/community/groups/$groupId/members/$userId',
          data: {'role': role},
        );
      });

  Future<void> removeMember(String groupId, String userId) => _guard(() async {
    await _dio.delete<Map<String, dynamic>>(
      '/community/groups/$groupId/members/$userId',
    );
  });

  Future<List<GroupAnnouncement>> announcements(String groupId) =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/community/groups/$groupId/announcements',
        );
        return _announcements(response.data);
      });

  Future<List<GroupAnnouncement>> postAnnouncement(
    String groupId,
    String body,
  ) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/community/groups/$groupId/announcements',
      data: {'body': body.trim()},
    );
    return _announcements(response.data);
  });

  Future<List<CommunitySession>> groupSessions(String groupId) =>
      _guard(() async {
        final response = await _dio.get<Map<String, dynamic>>(
          '/community/groups/$groupId/sessions',
        );
        return _list(
          _data(response.data)['items'],
        ).map(CommunitySession.fromJson).toList(growable: false);
      });

  Future<CommunitySession> createGroupSession(
    String groupId,
    SessionDraft draft,
  ) => _session(
    () => _dio.post(
      '/community/groups/$groupId/sessions',
      data: draft.toCreateJson(),
    ),
  );

  Future<String?> groupChat(String groupId) => _guard(() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/community/groups/$groupId/chat',
    );
    return _data(response.data)['conversationId'] as String?;
  });

  // ---- helpers ----

  Future<CommunitySession> _session(
    Future<Response<dynamic>> Function() call,
  ) => _guard(() async {
    final response = await call();
    return CommunitySession.fromJson(_data(_envelope(response.data)));
  });

  Future<CommunityGroup> _group(Future<Response<dynamic>> Function() call) =>
      _guard(() async {
        final response = await call();
        return CommunityGroup.fromJson(_data(_envelope(response.data)));
      });

  List<GroupAnnouncement> _announcements(Map<String, dynamic>? envelope) =>
      _list(
        _data(envelope)['items'],
      ).map(GroupAnnouncement.fromJson).toList(growable: false);

  PagedList<T> _page<T>(
    Map<String, dynamic>? envelope,
    T Function(Map<String, dynamic>) parse,
  ) => PagedList(
    _list(_data(envelope)['items']).map(parse).toList(growable: false),
    nextCursor: PagedList.cursorFrom(envelope),
  );

  Future<T> _guard<T>(Future<T> Function() work) async {
    try {
      return await work();
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Map<String, dynamic>? _envelope(Object? value) =>
      value is Map ? Map<String, dynamic>.from(value) : null;

  Map<String, dynamic> _data(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    if (data is Map) return Map<String, dynamic>.from(data);
    throw const FormatException('Missing community data');
  }

  List<Map<String, dynamic>> _list(Object? value) => value is List
      ? value
            .whereType<Map>()
            .map(Map<String, dynamic>.from)
            .toList(growable: false)
      : const [];
}

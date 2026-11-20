// Experts and Community (P3): introductions, sessions and community groups.
// Every fromJson is defensive: missing or unknown fields never throw.

String _text(Object? value) => value is String ? value : '';

String? _optText(Object? value) =>
    value is String && value.trim().isNotEmpty ? value : null;

int? _int(Object? value) => switch (value) {
  final num number => number.toInt(),
  final String text => int.tryParse(text),
  _ => null,
};

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;

Map<String, dynamic>? _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : null;

List<Map<String, dynamic>> _maps(Object? value) => value is List
    ? value
          .whereType<Map>()
          .map(Map<String, dynamic>.from)
          .toList(growable: false)
    : const [];

/// A place or category with names in both languages.
class NamedRef {
  const NamedRef({required this.id, this.nameEn = '', this.nameBn = ''});

  static NamedRef? fromJson(Object? value) {
    final json = _map(value);
    if (json == null) return null;
    return NamedRef(
      id: _text(json['id']),
      nameEn: _text(json['nameEn']),
      nameBn: _text(json['nameBn']),
    );
  }

  final String id;
  final String nameBn;
  final String nameEn;

  String nameFor(String languageCode) {
    if (languageCode == 'en') return nameEn.isNotEmpty ? nameEn : nameBn;
    return nameBn.isNotEmpty ? nameBn : nameEn;
  }
}

/// A person as these screens show them: never a phone number or email.
class CommunityPerson {
  const CommunityPerson({
    required this.userId,
    required this.displayName,
    this.trustLevel,
    this.bio,
  });

  factory CommunityPerson.fromJson(Object? value) {
    final json = _map(value) ?? const <String, dynamic>{};
    return CommunityPerson(
      userId: _text(json['userId'] ?? json['id']),
      displayName: _text(json['displayName']),
      trustLevel: _optText(json['trustLevel']),
      bio: _optText(json['bio']),
    );
  }

  final String? bio;
  final String displayName;
  final String? trustLevel;
  final String userId;
}

// ---------------------------------------------------------------------------
// Introductions

enum IntroductionContext {
  idea('IDEA'),
  business('BUSINESS'),
  learningGoal('LEARNING_GOAL');

  const IntroductionContext(this.wire);
  final String wire;

  static IntroductionContext parse(Object? value) => values.firstWhere(
    (item) => item.wire == value,
    orElse: () => learningGoal,
  );
}

class Introduction {
  const Introduction({
    required this.id,
    required this.status,
    required this.role,
    required this.requester,
    required this.expert,
    required this.contextType,
    required this.message,
    this.contextId,
    this.contextSummary,
    this.allowIdeaAccess = false,
    this.ideaAccessGranted = false,
    this.conversationId,
    this.allowedActions = const [],
    this.expiresAt,
    this.decidedAt,
    this.declineReason,
    this.createdAt,
  });

  factory Introduction.fromJson(Map<String, dynamic> json) {
    final context = _map(json['context']) ?? const <String, dynamic>{};
    return Introduction(
      id: _text(json['id']),
      status: _text(json['status']),
      role: _text(json['role']),
      requester: CommunityPerson.fromJson(json['requester']),
      expert: CommunityPerson.fromJson(json['expert']),
      contextType: IntroductionContext.parse(context['type']),
      contextId: _optText(context['id']),
      contextSummary: _optText(context['summary']),
      message: _text(json['message']),
      allowIdeaAccess: json['allowIdeaAccess'] == true,
      ideaAccessGranted: json['ideaAccessGranted'] == true,
      conversationId: _optText(json['conversationId']),
      allowedActions: json['allowedActions'] is List
          ? (json['allowedActions'] as List).whereType<String>().toList(
              growable: false,
            )
          : const [],
      expiresAt: _date(json['expiresAt']),
      decidedAt: _date(json['decidedAt']),
      declineReason: _optText(json['declineReason']),
      createdAt: _date(json['createdAt']),
    );
  }

  final List<String> allowedActions;
  final bool allowIdeaAccess;
  final String? contextId;
  final String? contextSummary;
  final IntroductionContext contextType;
  final String? conversationId;
  final DateTime? createdAt;
  final DateTime? decidedAt;
  final String? declineReason;
  final DateTime? expiresAt;
  final CommunityPerson expert;
  final String id;
  final bool ideaAccessGranted;
  final String message;
  final CommunityPerson requester;
  final String role;
  final String status;

  bool get iAmExpert => role == 'EXPERT';

  /// The other person in this introduction.
  CommunityPerson get other => iAmExpert ? requester : expert;

  bool can(String action) => allowedActions.contains(action);
}

class IntroductionDraft {
  const IntroductionDraft({
    required this.expertUserId,
    required this.contextType,
    required this.message,
    this.contextId,
    this.learningGoal,
    this.allowIdeaAccess = false,
  });

  final bool allowIdeaAccess;
  final String? contextId;
  final IntroductionContext contextType;
  final String expertUserId;
  final String? learningGoal;
  final String message;

  Map<String, dynamic> toJson() => {
    'expertUserId': expertUserId,
    'contextType': contextType.wire,
    if (contextType != IntroductionContext.learningGoal) 'contextId': contextId,
    if (contextType == IntroductionContext.learningGoal)
      'learningGoal': learningGoal?.trim(),
    'message': message.trim(),
    if (contextType == IntroductionContext.idea && allowIdeaAccess)
      'allowIdeaAccess': true,
  };
}

/// An idea or business the person may ask about.
class ContextChoice {
  const ContextChoice({
    required this.id,
    required this.title,
    this.owned = false,
  });

  final String id;

  /// For ideas: the person owns it (only owners may offer idea access).
  final bool owned;
  final String title;
}

// ---------------------------------------------------------------------------
// Sessions

enum SessionKind {
  consultation('CONSULTATION'),
  groupDiscussion('GROUP_DISCUSSION'),
  workshop('WORKSHOP'),
  event('EVENT');

  const SessionKind(this.wire);
  final String wire;

  static SessionKind parse(Object? value) =>
      values.firstWhere((item) => item.wire == value, orElse: () => event);

  static const hosted = [groupDiscussion, workshop, event];
}

enum SessionMode {
  inPerson('IN_PERSON'),
  online('ONLINE'),
  inAppChat('IN_APP_CHAT');

  const SessionMode(this.wire);
  final String wire;

  static SessionMode parse(Object? value) =>
      values.firstWhere((item) => item.wire == value, orElse: () => inPerson);
}

class SessionParticipant {
  const SessionParticipant({
    required this.userId,
    required this.displayName,
    required this.role,
    required this.status,
    this.cashAmountPoisha,
    this.cashRecordedAt,
  });

  factory SessionParticipant.fromJson(Map<String, dynamic> json) =>
      SessionParticipant(
        userId: _text(json['userId']),
        displayName: _text(json['displayName']),
        role: _text(json['role']),
        status: _text(json['status']),
        cashAmountPoisha: _optText(json['cashAmountPoisha']?.toString()),
        cashRecordedAt: _date(json['cashRecordedAt']),
      );

  final String? cashAmountPoisha;
  final DateTime? cashRecordedAt;
  final String displayName;
  final String role;
  final String status;
  final String userId;
}

class CommunitySession {
  const CommunitySession({
    required this.id,
    required this.kind,
    required this.title,
    required this.status,
    required this.mode,
    required this.host,
    this.description,
    this.subjectType,
    this.subjectId,
    this.startsAt,
    this.endsAt,
    this.durationMinutes,
    this.area,
    this.onlineLink,
    this.capacity = 0,
    this.placesTaken = 0,
    this.priceModel = 'FREE',
    this.pricePoisha,
    this.womenOnly = false,
    this.homeBasedFriendly = false,
    this.expert,
    this.introductionId,
    this.groupId,
    this.myCheckedInAt,
    this.waitlistPosition,
    this.myRole,
    this.myStatus,
    this.cancelReason,
    this.completedAt,
    this.participants = const [],
    this.hiddenReason,
    this.createdAt,
  });

  factory CommunitySession.fromJson(Map<String, dynamic> json) {
    final subject = _map(json['subject']);
    final expert = _map(json['expert']);
    return CommunitySession(
      id: _text(json['id']),
      kind: SessionKind.parse(json['kind']),
      title: _text(json['title']),
      description: _optText(json['description']),
      subjectType: _optText(subject?['type']),
      subjectId: _optText(subject?['id']),
      status: _text(json['status']),
      startsAt: _date(json['startsAt']),
      endsAt: _date(json['endsAt']),
      durationMinutes: _int(json['durationMinutes']),
      mode: SessionMode.parse(json['mode']),
      area: NamedRef.fromJson(json['area']),
      onlineLink: _optText(json['onlineLink']),
      capacity: _int(json['capacity']) ?? 0,
      placesTaken: _int(json['placesTaken']) ?? 0,
      priceModel: _optText(json['priceModel']) ?? 'FREE',
      pricePoisha: _optText(json['pricePoisha']?.toString()),
      womenOnly: json['womenOnly'] == true,
      homeBasedFriendly: json['homeBasedFriendly'] == true,
      host: CommunityPerson.fromJson(json['host']),
      expert: expert == null ? null : CommunityPerson.fromJson(expert),
      introductionId: _optText(json['introductionId']),
      groupId: _optText(json['groupId']),
      myCheckedInAt: _date(json['myCheckedInAt']),
      waitlistPosition: _int(json['waitlistPosition']),
      myRole: _optText(json['myRole']),
      myStatus: _optText(json['myStatus']),
      cancelReason: _optText(json['cancelReason']),
      completedAt: _date(json['completedAt']),
      participants: _maps(
        json['participants'],
      ).map(SessionParticipant.fromJson).toList(growable: false),
      hiddenReason: _optText(json['hiddenReason']),
      createdAt: _date(json['createdAt']),
    );
  }

  final NamedRef? area;
  final String? cancelReason;
  final int capacity;
  final DateTime? completedAt;
  final DateTime? createdAt;
  final String? description;
  final int? durationMinutes;
  final DateTime? endsAt;
  final CommunityPerson? expert;
  final String? groupId;
  final String? hiddenReason;
  final bool homeBasedFriendly;
  final CommunityPerson host;
  final String id;
  final String? introductionId;
  final SessionKind kind;
  final SessionMode mode;
  final DateTime? myCheckedInAt;
  final String? myRole;
  final String? myStatus;
  final String? onlineLink;
  final List<SessionParticipant> participants;
  final int placesTaken;
  final String priceModel;
  final String? pricePoisha;
  final DateTime? startsAt;
  final String status;
  final String? subjectId;
  final String? subjectType;
  final String title;
  final int? waitlistPosition;
  final bool womenOnly;

  bool get isHost => myRole == 'HOST';
  bool get isConsultation => kind == SessionKind.consultation;
  bool get isOpen => status == 'DRAFT' || status == 'SCHEDULED';
  bool get isCash => priceModel == 'CASH';
  bool get hasStarted =>
      startsAt != null && !DateTime.now().isBefore(startsAt!);
  bool get confirmed => myStatus == 'ACCEPTED' || myStatus == 'ATTENDED';

  /// The person on the other side of a consultation, for its expert.
  SessionParticipant? get requester {
    for (final person in participants) {
      if (person.role == 'PARTICIPANT') return person;
    }
    return null;
  }
}

/// The fields of `POST /sessions`, the group create and `PATCH`.
class SessionDraft {
  const SessionDraft({
    required this.kind,
    required this.title,
    required this.startsAt,
    required this.durationMinutes,
    required this.capacity,
    required this.mode,
    this.description,
    this.locationId,
    this.onlineLink,
    this.priceModel = 'FREE',
    this.pricePoisha,
    this.womenOnly = false,
    this.homeBasedFriendly = false,
  });

  final int capacity;
  final String? description;
  final int durationMinutes;
  final bool homeBasedFriendly;
  final SessionKind kind;
  final String? locationId;
  final SessionMode mode;
  final String? onlineLink;
  final String priceModel;
  final String? pricePoisha;
  final DateTime startsAt;
  final String title;
  final bool womenOnly;

  Map<String, dynamic> toCreateJson() => {
    'kind': kind.wire,
    'title': title.trim(),
    if (description != null && description!.trim().isNotEmpty)
      'description': description!.trim(),
    'startsAt': startsAt.toUtc().toIso8601String(),
    'durationMinutes': durationMinutes,
    'capacity': capacity,
    'mode': mode.wire,
    if (mode == SessionMode.inPerson && locationId != null)
      'locationId': locationId,
    if (mode == SessionMode.online &&
        onlineLink != null &&
        onlineLink!.trim().isNotEmpty)
      'onlineLink': onlineLink!.trim(),
    'priceModel': priceModel,
    if (priceModel == 'CASH' && pricePoisha != null) 'pricePoisha': pricePoisha,
    if (womenOnly) 'womenOnly': true,
    if (homeBasedFriendly) 'homeBasedFriendly': true,
  };

  /// `PATCH /sessions/:id`: no kind, nulls clear optional fields.
  Map<String, dynamic> toUpdateJson({bool includeWomenOnly = true}) => {
    'title': title.trim(),
    'description': description == null || description!.trim().isEmpty
        ? null
        : description!.trim(),
    'startsAt': startsAt.toUtc().toIso8601String(),
    'durationMinutes': durationMinutes,
    'capacity': capacity,
    'mode': mode.wire,
    'locationId': mode == SessionMode.inPerson ? locationId : null,
    'onlineLink':
        mode == SessionMode.online &&
            onlineLink != null &&
            onlineLink!.trim().isNotEmpty
        ? onlineLink!.trim()
        : null,
    'priceModel': priceModel,
    'pricePoisha': priceModel == 'CASH' ? pricePoisha : null,
    if (includeWomenOnly) 'womenOnly': womenOnly,
    'homeBasedFriendly': homeBasedFriendly,
  };
}

class ExpertSlot {
  const ExpertSlot({required this.startsAt, required this.endsAt});

  static ExpertSlot? fromJson(Map<String, dynamic> json) {
    final start = _date(json['startsAt']);
    final end = _date(json['endsAt']);
    if (start == null || end == null) return null;
    return ExpertSlot(startsAt: start, endsAt: end);
  }

  final DateTime endsAt;
  final DateTime startsAt;

  Duration get length => endsAt.difference(startsAt);
}

class ConsultationRequest {
  const ConsultationRequest({
    required this.expertUserId,
    required this.startsAt,
    required this.durationMinutes,
    required this.mode,
    this.locationId,
    this.title,
    this.note,
    this.introductionId,
  });

  final int durationMinutes;
  final String expertUserId;
  final String? introductionId;
  final String? locationId;
  final SessionMode mode;
  final String? note;
  final DateTime startsAt;
  final String? title;

  Map<String, dynamic> toJson() => {
    'expertUserId': expertUserId,
    'startsAt': startsAt.toUtc().toIso8601String(),
    'durationMinutes': durationMinutes,
    'mode': mode.wire,
    if (mode == SessionMode.inPerson && locationId != null)
      'locationId': locationId,
    if (title != null && title!.trim().isNotEmpty) 'title': title!.trim(),
    if (note != null && note!.trim().isNotEmpty) 'note': note!.trim(),
    'introductionId': ?introductionId,
  };
}

/// `GET /reviews/subject?subjectType=SESSION`.
class SessionFeedbackState {
  const SessionFeedbackState({
    this.canReview = false,
    this.windowEndsAt,
    this.myRating,
    this.myComment,
    this.received = const [],
  });

  factory SessionFeedbackState.fromJson(Map<String, dynamic> json) {
    final mine = _map(json['myReview']);
    return SessionFeedbackState(
      canReview: json['canReview'] == true,
      windowEndsAt: _date(json['windowEndsAt']),
      myRating: _int(mine?['rating']),
      myComment: _optText(mine?['comment']),
      received: _maps(json['receivedReviews'])
          .map(
            (item) => (
              rating: _int(item['rating']) ?? 0,
              comment: _optText(item['comment']),
            ),
          )
          .toList(growable: false),
    );
  }

  final bool canReview;
  final String? myComment;
  final int? myRating;
  final List<({int rating, String? comment})> received;
  final DateTime? windowEndsAt;
}

// ---------------------------------------------------------------------------
// Community groups

class GroupMembership {
  const GroupMembership({
    required this.role,
    required this.status,
    this.invited = false,
  });

  static GroupMembership? fromJson(Object? value) {
    final json = _map(value);
    if (json == null) return null;
    return GroupMembership(
      role: _text(json['role']),
      status: _text(json['status']),
      invited: json['invited'] == true,
    );
  }

  final bool invited;
  final String role;
  final String status;

  bool get active => status == 'ACTIVE';
  bool get pending => status == 'PENDING';
  bool get moderator => active && role == 'MODERATOR';
  bool get canAnnounce =>
      active && (role == 'MODERATOR' || role == 'AMBASSADOR');
}

class CommunityGroup {
  const CommunityGroup({
    required this.id,
    required this.name,
    this.description,
    this.visibility = 'PUBLIC',
    this.womenOnly = false,
    this.area,
    this.category,
    this.memberCount = 0,
    this.myMembership,
    this.status = 'ACTIVE',
    this.createdAt,
  });

  factory CommunityGroup.fromJson(Map<String, dynamic> json) => CommunityGroup(
    id: _text(json['id']),
    name: _text(json['name']),
    description: _optText(json['description']),
    visibility: _optText(json['visibility']) ?? 'PUBLIC',
    womenOnly: json['womenOnly'] == true,
    area: NamedRef.fromJson(json['area']),
    category: NamedRef.fromJson(json['category']),
    memberCount: _int(json['memberCount']) ?? 0,
    myMembership: GroupMembership.fromJson(json['myMembership']),
    status: _optText(json['status']) ?? 'ACTIVE',
    createdAt: _date(json['createdAt']),
  );

  final NamedRef? area;
  final NamedRef? category;
  final DateTime? createdAt;
  final String? description;
  final String id;
  final int memberCount;
  final GroupMembership? myMembership;
  final String name;
  final String status;
  final String visibility;
  final bool womenOnly;

  bool get isMember => myMembership?.active ?? false;
  bool get isModerator => myMembership?.moderator ?? false;
  bool get canAnnounce => myMembership?.canAnnounce ?? false;
  bool get isPrivate => visibility == 'PRIVATE';
}

class GroupDraft {
  const GroupDraft({
    required this.name,
    this.description,
    this.visibility = 'PUBLIC',
    this.womenOnly = false,
    this.locationId,
    this.categoryId,
  });

  final String? categoryId;
  final String? description;
  final String? locationId;
  final String name;
  final String visibility;
  final bool womenOnly;

  Map<String, dynamic> toCreateJson() => {
    'name': name.trim(),
    if (description != null && description!.trim().isNotEmpty)
      'description': description!.trim(),
    'visibility': visibility,
    if (womenOnly) 'womenOnly': true,
    'locationId': ?locationId,
    'categoryId': ?categoryId,
  };

  /// Women-only cannot change after creation, so it is never sent here.
  Map<String, dynamic> toUpdateJson() => {
    'name': name.trim(),
    'description': description == null || description!.trim().isEmpty
        ? null
        : description!.trim(),
    'visibility': visibility,
    'locationId': locationId,
    'categoryId': categoryId,
  };
}

class GroupMember {
  const GroupMember({
    required this.id,
    required this.userId,
    required this.displayName,
    required this.role,
    required this.status,
    this.kind,
    this.joinedAt,
  });

  factory GroupMember.fromJson(Map<String, dynamic> json) => GroupMember(
    id: _text(json['id']),
    userId: _text(json['userId']),
    displayName: _text(json['displayName']),
    role: _text(json['role']),
    status: _text(json['status']),
    kind: _optText(json['kind']),
    joinedAt: _date(json['joinedAt']),
  );

  final String displayName;
  final String id;
  final DateTime? joinedAt;

  /// INVITATION or REQUEST for a pending row.
  final String? kind;
  final String role;
  final String status;
  final String userId;

  bool get isRequest => kind == 'REQUEST';
}

class GroupAnnouncement {
  const GroupAnnouncement({
    required this.id,
    required this.body,
    required this.postedBy,
    this.createdAt,
  });

  factory GroupAnnouncement.fromJson(Map<String, dynamic> json) =>
      GroupAnnouncement(
        id: _text(json['id']),
        body: _text(json['body']),
        postedBy: CommunityPerson.fromJson(json['postedBy']),
        createdAt: _date(json['createdAt']),
      );

  final String body;
  final DateTime? createdAt;
  final String id;
  final CommunityPerson postedBy;
}

/// Someone from the worker directory, to invite.
class PersonChoice {
  const PersonChoice({
    required this.userId,
    required this.displayName,
    this.area,
  });

  factory PersonChoice.fromJson(Map<String, dynamic> json) => PersonChoice(
    userId: _text(json['id'] ?? json['userId']),
    displayName: _text(json['displayName']),
    area: NamedRef.fromJson(json['area']),
  );

  final NamedRef? area;
  final String displayName;
  final String userId;
}

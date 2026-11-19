/// Ideas (P2.7 to P2.9). Every `fromJson` is defensive: missing keys get
/// safe defaults and unknown keys are ignored, because the server is still
/// changing.
library;

String _string(Object? value) => value is String ? value : '';

String? _optional(Object? value) =>
    value is String && value.trim().isNotEmpty ? value : null;

int _int(Object? value) => switch (value) {
  final int number => number,
  final num number => number.toInt(),
  final String text => int.tryParse(text) ?? 0,
  _ => 0,
};

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toLocal() : null;

Map<String, dynamic>? _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : null;

List<T> _list<T>(Object? value, T Function(Map<String, dynamic>) read) =>
    value is List
    ? value
          .whereType<Map>()
          .map((item) => read(Map<String, dynamic>.from(item)))
          .toList(growable: false)
    : const [];

/// A server text in both languages, such as `stageLabel` or a notice.
class IdeaText {
  const IdeaText({this.en = '', this.bn = '', this.key});

  factory IdeaText.fromJson(Object? json) {
    final map = _map(json);
    if (map == null) return const IdeaText();
    return IdeaText(
      en: _string(map['en']),
      bn: _string(map['bn']),
      key: _optional(map['key']),
    );
  }

  final String en;
  final String bn;
  final String? key;

  bool get isEmpty => en.isEmpty && bn.isEmpty;

  /// The text for [languageCode], falling back to the other language.
  String forLanguage(String languageCode) => languageCode == 'en'
      ? (en.isNotEmpty ? en : bn)
      : (bn.isNotEmpty ? bn : en);
}

/// A sector, an area or a skill: an id with English and Bangla names.
class IdeaNamed {
  const IdeaNamed({
    required this.id,
    this.nameEn = '',
    this.nameBn = '',
    this.slug,
    this.parentId,
    this.verified = false,
  });

  factory IdeaNamed.fromJson(Map<String, dynamic> json) => IdeaNamed(
    id: _string(json['id']),
    nameEn: _string(json['nameEn'] ?? json['name_en']),
    nameBn: _string(json['nameBn'] ?? json['name_bn']),
    slug: _optional(json['slug']),
    parentId: _optional(json['parentId']),
    verified: json['verified'] == true,
  );

  static IdeaNamed? maybe(Object? json) {
    final map = _map(json);
    return map == null ? null : IdeaNamed.fromJson(map);
  }

  final String id;
  final String nameEn;
  final String nameBn;
  final String? slug;
  final String? parentId;
  final bool verified;

  String nameFor(String languageCode) => languageCode == 'en'
      ? (nameEn.isNotEmpty ? nameEn : nameBn)
      : (nameBn.isNotEmpty ? nameBn : nameEn);
}

abstract final class IdeaStages {
  static const concept = 'CONCEPT';
  static const validating = 'VALIDATING';
  static const pilot = 'PILOT';
  static const converted = 'CONVERTED';

  /// The stages an owner may choose (CONVERTED comes from conversion).
  static const open = [concept, validating, pilot];
}

abstract final class IdeaVisibilities {
  static const private = 'PRIVATE';
  static const summaryPublic = 'SUMMARY_PUBLIC';
  static const members = 'MEMBERS';
  static const all = [private, summaryPublic, members];
}

abstract final class IdeaRoleTypes {
  static const all = [
    'CO_FOUNDER',
    'TECHNICAL',
    'MARKETING',
    'OPERATIONS',
    'INDUSTRY_EXPERT',
    'MENTOR',
    'SUPPLIER',
    'DISTRIBUTION',
    'PRODUCTION',
    'RESEARCH',
  ];
}

abstract final class IdeaTimeCommitments {
  static const all = ['FEW_HOURS_A_WEEK', 'PART_TIME', 'FULL_TIME', 'FLEXIBLE'];
}

abstract final class IdeaArrangements {
  static const all = ['PAID', 'EQUITY_TO_DISCUSS', 'VOLUNTEER', 'UNDECIDED'];
}

abstract final class IdeaRoleStatuses {
  static const open = 'OPEN';
  static const all = ['OPEN', 'FILLED', 'CLOSED'];
}

/// A role the idea is looking for.
class IdeaRole {
  const IdeaRole({
    required this.id,
    required this.roleType,
    this.roleLabel = const IdeaText(),
    this.title,
    this.description,
    this.timeCommitment = '',
    this.arrangement,
    this.status = IdeaRoleStatuses.open,
    this.skills = const [],
  });

  factory IdeaRole.fromJson(Map<String, dynamic> json) => IdeaRole(
    id: _string(json['id']),
    roleType: _string(json['roleType']),
    roleLabel: IdeaText.fromJson(json['roleLabel']),
    title: _optional(json['title']),
    description: _optional(json['description']),
    timeCommitment: _string(json['timeCommitment']),
    arrangement: _optional(json['arrangement']),
    status: _optional(json['status']) ?? IdeaRoleStatuses.open,
    skills: _list(json['skills'], IdeaNamed.fromJson),
  );

  final String id;
  final String roleType;
  final IdeaText roleLabel;
  final String? title;
  final String? description;
  final String timeCommitment;
  final String? arrangement;
  final String status;
  final List<IdeaNamed> skills;

  bool get isOpen => status == IdeaRoleStatuses.open;
}

class IdeaPerson {
  const IdeaPerson({
    required this.userId,
    this.displayName = '',
    this.identityVerified = false,
    this.trustLevel,
  });

  factory IdeaPerson.fromJson(Object? json) {
    final map = _map(json) ?? const <String, dynamic>{};
    return IdeaPerson(
      userId: _string(map['userId']),
      displayName: _string(map['displayName']),
      identityVerified: map['identityVerified'] == true,
      trustLevel: _optional(map['trustLevel']),
    );
  }

  final String userId;
  final String displayName;
  final bool identityVerified;
  final String? trustLevel;
}

/// Problem, solution and the longer details: only for the owner, the team
/// and people the owner approved.
class IdeaDetails {
  const IdeaDetails({this.problem = '', this.solution = '', this.details});

  factory IdeaDetails.fromJson(Map<String, dynamic> json) => IdeaDetails(
    problem: _string(json['problem']),
    solution: _string(json['solution']),
    details: _optional(json['details']),
  );

  final String problem;
  final String solution;
  final String? details;
}

/// The viewer request for the private details (outsiders only).
class IdeaAccessState {
  const IdeaAccessState({required this.status, this.requestedAt});

  factory IdeaAccessState.fromJson(Map<String, dynamic> json) =>
      IdeaAccessState(
        status: _string(json['status']),
        requestedAt: _date(json['requestedAt']),
      );

  final String status;
  final DateTime? requestedAt;
}

/// One idea as the viewer may see it: a summary card for everyone, plus
/// the details for the team and approved people, plus the owner fields.
class Idea {
  const Idea({
    required this.id,
    required this.title,
    this.summary = '',
    this.category,
    this.area,
    this.stage = IdeaStages.concept,
    this.stageLabel = const IdeaText(),
    this.owner = const IdeaPerson(userId: ''),
    this.roles = const [],
    this.teamSize = 1,
    this.myRelation,
    this.canViewDetails = false,
    this.createdAt,
    this.updatedAt,
    this.details,
    this.notice,
    this.myAccess,
    this.visibility,
    this.convertedBusinessId,
    this.convertedAt,
    this.status,
    this.hiddenReason,
  });

  factory Idea.fromJson(Map<String, dynamic> json) {
    final details = _map(json['details']);
    final access = _map(json['myAccess']);
    final notice = IdeaText.fromJson(json['notice']);
    return Idea(
      id: _string(json['id']),
      title: _string(json['title']),
      summary: _string(json['summary']),
      category: IdeaNamed.maybe(json['category']),
      area: IdeaNamed.maybe(json['area']),
      stage: _optional(json['stage']) ?? IdeaStages.concept,
      stageLabel: IdeaText.fromJson(json['stageLabel']),
      owner: IdeaPerson.fromJson(json['owner']),
      roles: _list(json['roles'], IdeaRole.fromJson),
      teamSize: json['teamSize'] == null ? 1 : _int(json['teamSize']),
      myRelation: _optional(json['myRelation']),
      canViewDetails: json['canViewDetails'] == true,
      createdAt: _date(json['createdAt']),
      updatedAt: _date(json['updatedAt']),
      details: details == null ? null : IdeaDetails.fromJson(details),
      notice: notice.isEmpty ? null : notice,
      myAccess: access == null ? null : IdeaAccessState.fromJson(access),
      visibility: _optional(json['visibility']),
      convertedBusinessId: _optional(json['convertedBusinessId']),
      convertedAt: _date(json['convertedAt']),
      status: _optional(json['status']),
      hiddenReason: _optional(json['hiddenReason']),
    );
  }

  final String id;
  final String title;
  final String summary;
  final IdeaNamed? category;
  final IdeaNamed? area;
  final String stage;
  final IdeaText stageLabel;
  final IdeaPerson owner;
  final List<IdeaRole> roles;
  final int teamSize;

  /// OWNER, MEMBER, ACCESS or null (only the public card).
  final String? myRelation;
  final bool canViewDetails;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final IdeaDetails? details;

  /// The confidentiality notice that goes with the details.
  final IdeaText? notice;
  final IdeaAccessState? myAccess;

  // Owner only.
  final String? visibility;
  final String? convertedBusinessId;
  final DateTime? convertedAt;
  final String? status;
  final String? hiddenReason;

  bool get isOwner => myRelation == 'OWNER';
  bool get isMember => myRelation == 'MEMBER';
  bool get isTeam => isOwner || isMember;
  bool get isHidden => status == 'HIDDEN';
  bool get isConverted =>
      stage == IdeaStages.converted || convertedBusinessId != null;

  List<IdeaRole> get openRoles =>
      roles.where((role) => role.isOpen).toList(growable: false);

  IdeaRole? role(String roleId) {
    for (final role in roles) {
      if (role.id == roleId) return role;
    }
    return null;
  }
}

/// `GET /me/ideas`.
class MyIdeas {
  const MyIdeas({this.owned = const [], this.team = const []});

  factory MyIdeas.fromJson(Map<String, dynamic> json) => MyIdeas(
    owned: _list(json['owned'], Idea.fromJson),
    team: _list(json['team'], Idea.fromJson),
  );

  final List<Idea> owned;
  final List<Idea> team;
}

/// One of the ideas I asked to see (`GET /me/idea-access`).
class MyIdeaAccess {
  const MyIdeaAccess({
    required this.ideaId,
    this.title = '',
    this.summary = '',
    this.status = '',
    this.requestedAt,
    this.canViewDetails = false,
  });

  factory MyIdeaAccess.fromJson(Map<String, dynamic> json) => MyIdeaAccess(
    ideaId: _string(json['ideaId']),
    title: _string(json['title']),
    summary: _string(json['summary']),
    status: _string(json['status']),
    requestedAt: _date(json['requestedAt']),
    canViewDetails: json['canViewDetails'] == true,
  );

  final String ideaId;
  final String title;
  final String summary;
  final String status;
  final DateTime? requestedAt;
  final bool canViewDetails;
}

/// Somebody who asked the owner for the details.
class IdeaAccessRequest {
  const IdeaAccessRequest({
    required this.userId,
    this.displayName = '',
    this.trustLevel,
    this.status = '',
    this.message,
    this.requestedAt,
    this.approvedAt,
    this.decidedAt,
    this.revokedAt,
  });

  factory IdeaAccessRequest.fromJson(Map<String, dynamic> json) =>
      IdeaAccessRequest(
        userId: _string(json['userId']),
        displayName: _string(json['displayName']),
        trustLevel: _optional(json['trustLevel']),
        status: _string(json['status']),
        message: _optional(json['message']),
        requestedAt: _date(json['requestedAt']),
        approvedAt: _date(json['approvedAt']),
        decidedAt: _date(json['decidedAt']),
        revokedAt: _date(json['revokedAt']),
      );

  final String userId;
  final String displayName;
  final String? trustLevel;
  final String status;
  final String? message;
  final DateTime? requestedAt;
  final DateTime? approvedAt;
  final DateTime? decidedAt;
  final DateTime? revokedAt;
}

/// One logged view of the details.
class IdeaView {
  const IdeaView({
    required this.id,
    this.viewerUserId = '',
    this.displayName = '',
    this.basis = '',
    this.viewedAt,
  });

  factory IdeaView.fromJson(Map<String, dynamic> json) => IdeaView(
    id: _string(json['id']),
    viewerUserId: _string(json['viewerUserId']),
    displayName: _string(json['displayName']),
    basis: _string(json['basis']),
    viewedAt: _date(json['viewedAt']),
  );

  final String id;
  final String viewerUserId;
  final String displayName;
  final String basis;
  final DateTime? viewedAt;
}

class IdeaMatchReason {
  const IdeaMatchReason({
    this.code = '',
    this.text = const IdeaText(),
    this.points = 0,
  });

  factory IdeaMatchReason.fromJson(Map<String, dynamic> json) =>
      IdeaMatchReason(
        code: _string(json['code']),
        text: IdeaText.fromJson(json),
        points: _int(json['points']),
      );

  final String code;
  final IdeaText text;
  final int points;
}

class IdeaMatch {
  const IdeaMatch({
    required this.userId,
    this.displayName = '',
    this.trustLevel,
    this.area,
    this.score = 0,
    this.matchedSkills = const [],
    this.reasons = const [],
  });

  factory IdeaMatch.fromJson(Map<String, dynamic> json) => IdeaMatch(
    userId: _string(json['userId']),
    displayName: _string(json['displayName']),
    trustLevel: _optional(json['trustLevel']),
    area: IdeaNamed.maybe(json['area']),
    score: _int(json['score']),
    matchedSkills: _list(json['matchedSkills'], IdeaNamed.fromJson),
    reasons: _list(json['reasons'], IdeaMatchReason.fromJson),
  );

  final String userId;
  final String displayName;
  final String? trustLevel;
  final IdeaNamed? area;
  final int score;
  final List<IdeaNamed> matchedSkills;
  final List<IdeaMatchReason> reasons;
}

/// Suggested people for a role, chosen by KAAJ.
class IdeaRoleMatches {
  const IdeaRoleMatches({
    required this.roleId,
    this.source = '',
    this.explanation = const IdeaText(),
    this.items = const [],
  });

  factory IdeaRoleMatches.fromJson(Map<String, dynamic> json) {
    final explanation = _map(json['explanation']) ?? const {};
    return IdeaRoleMatches(
      roleId: _string(json['roleId']),
      source: _string(explanation['source']),
      explanation: IdeaText.fromJson(explanation),
      items: _list(json['items'], IdeaMatch.fromJson),
    );
  }

  final String roleId;
  final String source;
  final IdeaText explanation;
  final List<IdeaMatch> items;
}

class IdeaMember {
  const IdeaMember({
    required this.userId,
    this.displayName = '',
    this.role,
    this.roleLabel,
    this.status = '',
    this.agreedInPrincipleAt,
    this.collaborationRequestId,
  });

  factory IdeaMember.fromJson(Map<String, dynamic> json) {
    final role = _map(json['role']);
    return IdeaMember(
      userId: _string(json['userId']),
      displayName: _string(json['displayName']),
      role: role == null ? null : IdeaRole.fromJson(role),
      roleLabel: _optional(json['roleLabel']),
      status: _string(json['status']),
      agreedInPrincipleAt: _date(json['agreedInPrincipleAt']),
      collaborationRequestId: _optional(json['collaborationRequestId']),
    );
  }

  final String userId;
  final String displayName;
  final IdeaRole? role;

  /// The free text label the owner gave.
  final String? roleLabel;
  final String status;
  final DateTime? agreedInPrincipleAt;
  final String? collaborationRequestId;
}

/// `GET /ideas/:id/members`.
class IdeaTeam {
  const IdeaTeam({
    this.notice,
    this.owner = const IdeaPerson(userId: ''),
    this.items = const [],
  });

  factory IdeaTeam.fromJson(Map<String, dynamic> json) {
    final notice = IdeaText.fromJson(json['notice']);
    return IdeaTeam(
      notice: notice.isEmpty ? null : notice,
      owner: IdeaPerson.fromJson(json['owner']),
      items: _list(json['items'], IdeaMember.fromJson),
    );
  }

  final IdeaText? notice;
  final IdeaPerson owner;
  final List<IdeaMember> items;
}

/// The parts of a collaboration request the Ideas screens use.
class IdeaCollaboration {
  const IdeaCollaboration({
    required this.id,
    this.status = '',
    this.requester = const IdeaPerson(userId: ''),
    this.ideaRoleId,
    this.message = '',
    this.notice,
  });

  factory IdeaCollaboration.fromJson(Map<String, dynamic> json) {
    final subject = _map(json['subject']) ?? const {};
    final notice = IdeaText.fromJson(json['notice']);
    return IdeaCollaboration(
      id: _string(json['id']),
      status: _string(json['status']),
      requester: IdeaPerson.fromJson(json['requester']),
      ideaRoleId: _optional(subject['ideaRoleId']),
      message: _string(json['message']),
      notice: notice.isEmpty ? null : notice,
    );
  }

  final String id;
  final String status;
  final IdeaPerson requester;
  final String? ideaRoleId;
  final String message;
  final IdeaText? notice;
}

/// What the owner writes. [toCreateJson] sends the create fields;
/// [toPatchJson] only what changed against [original].
class IdeaDraft {
  const IdeaDraft({
    required this.title,
    required this.summary,
    required this.problem,
    required this.solution,
    required this.details,
    required this.categoryId,
    required this.locationId,
    required this.stage,
    required this.visibility,
  });

  final String title;
  final String summary;
  final String problem;
  final String solution;
  final String details;
  final String categoryId;
  final String? locationId;
  final String stage;
  final String visibility;

  Map<String, dynamic> toCreateJson() => {
    'title': title.trim(),
    'summary': summary.trim(),
    'problem': problem.trim(),
    'solution': solution.trim(),
    if (details.trim().isNotEmpty) 'details': details.trim(),
    'categoryId': categoryId,
    'locationId': ?locationId,
    'stage': stage,
    'visibility': visibility,
  };

  Map<String, dynamic> toPatchJson(Idea original) {
    final before = original.details;
    final patch = <String, dynamic>{};
    void put(String key, Object? value, Object? old) {
      if (value != old) patch[key] = value;
    }

    put('title', title.trim(), original.title);
    put('summary', summary.trim(), original.summary);
    put('problem', problem.trim(), before?.problem);
    put('solution', solution.trim(), before?.solution);
    final newDetails = details.trim().isEmpty ? null : details.trim();
    put('details', newDetails, before?.details);
    put('categoryId', categoryId, original.category?.id);
    put('locationId', locationId, original.area?.id);
    if (!original.isConverted) put('stage', stage, original.stage);
    put('visibility', visibility, original.visibility);
    return patch;
  }
}

/// What the owner writes for a role.
class IdeaRoleDraft {
  const IdeaRoleDraft({
    required this.roleType,
    required this.title,
    required this.description,
    required this.skillIds,
    required this.timeCommitment,
    required this.arrangement,
    this.status,
  });

  final String roleType;
  final String title;
  final String description;
  final List<String> skillIds;
  final String timeCommitment;
  final String? arrangement;
  final String? status;

  Map<String, dynamic> toCreateJson() => {
    'roleType': roleType,
    if (title.trim().isNotEmpty) 'title': title.trim(),
    if (description.trim().isNotEmpty) 'description': description.trim(),
    'skillIds': skillIds,
    'timeCommitment': timeCommitment,
    'arrangement': ?arrangement,
  };

  Map<String, dynamic> toPatchJson() => {
    'roleType': roleType,
    'title': title.trim().isEmpty ? null : title.trim(),
    'description': description.trim().isEmpty ? null : description.trim(),
    'skillIds': skillIds,
    'timeCommitment': timeCommitment,
    'arrangement': ?arrangement,
    'status': ?status,
  };
}

/// Filters of the public idea search. A record, so equal filters share a
/// provider.
typedef IdeaFilter = ({
  String? categoryId,
  String? locationId,
  String? stage,
  String? roleType,
  String? q,
});

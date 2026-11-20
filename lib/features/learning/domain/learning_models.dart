import '../../../core/formatting/money.dart';

/// Training (a course of sessions) or apprenticeship (learning on the job
/// with a mentor). Never paid work, and never shown as a job.
enum LearningKind {
  training('TRAINING'),
  apprenticeship('APPRENTICESHIP');

  const LearningKind(this.wire);
  final String wire;

  static LearningKind parse(Object? value) => value == 'APPRENTICESHIP'
      ? LearningKind.apprenticeship
      : LearningKind.training;
}

/// The money terms for the learner.
enum ParticipantTerms {
  free('FREE'),
  paidByParticipant('PAID_BY_PARTICIPANT'),
  stipend('STIPEND'),
  unpaid('UNPAID');

  const ParticipantTerms(this.wire);
  final String wire;

  static ParticipantTerms parse(Object? value) => ParticipantTerms.values
      .firstWhere((item) => item.wire == value, orElse: () => free);
}

/// Where the learning happens.
enum DeliveryMode {
  onSite('ON_SITE'),
  homeBased('HOME_BASED'),
  remote('REMOTE'),
  hybrid('HYBRID');

  const DeliveryMode(this.wire);
  final String wire;

  static DeliveryMode parse(Object? value) => DeliveryMode.values.firstWhere(
    (item) => item.wire == value,
    orElse: () => onSite,
  );
}

class LearningMentor {
  const LearningMentor({
    required this.id,
    required this.displayName,
    this.trustLevel,
    this.yearsExperience,
  });

  factory LearningMentor.fromJson(Map<String, dynamic> json) => LearningMentor(
    id: (json['id'] ?? json['userId']) as String? ?? '',
    displayName: (json['displayName'] ?? json['name']) as String? ?? '',
    trustLevel: json['trustLevel'] as String?,
    yearsExperience: (json['yearsExperience'] as num?)?.toInt(),
  );

  final String displayName;
  final String id;
  final String? trustLevel;
  final int? yearsExperience;
}

/// A training or apprenticeship published by an approved mentor.
class LearningOpportunity {
  const LearningOpportunity({
    required this.id,
    required this.kind,
    required this.title,
    required this.description,
    required this.terms,
    this.status = '',
    this.categoryNameBn = '',
    this.categoryNameEn = '',
    this.areaNameBn = '',
    this.areaNameEn = '',
    this.skillNames = const [],
    this.feePoisha,
    this.stipendPoisha,
    this.seats,
    this.seatsLeft,
    this.startsAt,
    this.endsAt,
    this.deliveryMode = DeliveryMode.onSite,
    this.flexibleHours = false,
    this.mentor,
    this.viewerApplicationStatus,
    this.isMine = false,
    this.closedToApplications = false,
    this.applicationsCount,
    this.skillIds = const [],
    this.viewerApplicationId,
  });

  /// Reads both the camelCase learning shape and the snake_case job shape.
  factory LearningOpportunity.fromJson(Map<String, dynamic> json) {
    Object? read(String camel, [String? snake]) =>
        json[camel] ?? (snake == null ? null : json[snake]);
    String nested(Object? value, String camel, String snake) =>
        value is Map ? (value[camel] ?? value[snake]) as String? ?? '' : '';
    final category = read('category');
    final area = read('area') ?? read('location');
    final skills = read('skills');
    final mentor = read('mentor') ?? read('poster');
    final seats = (read('seats') as num?)?.toInt();
    final filled = (read('seatsFilled', 'seats_filled') as num?)?.toInt();
    final application = read('viewerApplication');
    return LearningOpportunity(
      id: json['id'] as String? ?? '',
      kind: LearningKind.parse(read('opportunityType', 'opportunity_type')),
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
      status: json['status'] as String? ?? '',
      terms: ParticipantTerms.parse(
        read('participantTerms', 'participant_terms'),
      ),
      feePoisha: Money.tryParse(
        read('participantFeePoisha', 'participant_fee_poisha'),
      ),
      stipendPoisha: Money.tryParse(read('stipendPoisha', 'stipend_poisha')),
      seats: seats,
      seatsLeft:
          (read('seatsLeft', 'seats_left') as num?)?.toInt() ??
          (seats != null && filled != null ? seats - filled : null),
      startsAt: DateTime.tryParse(
        read('startsAt', 'starts_at') as String? ?? '',
      ),
      endsAt: DateTime.tryParse(read('endsAt', 'ends_at') as String? ?? ''),
      deliveryMode: DeliveryMode.parse(
        read('workArrangement', 'work_arrangement') ?? read('deliveryMode'),
      ),
      flexibleHours: read('flexibleHours', 'flexible_hours') == true,
      categoryNameBn: nested(category, 'nameBn', 'name_bn'),
      categoryNameEn: nested(category, 'nameEn', 'name_en'),
      areaNameBn: nested(area, 'nameBn', 'name_bn'),
      areaNameEn: nested(area, 'nameEn', 'name_en'),
      skillIds: skills is List
          ? skills
                .whereType<Map>()
                .map((item) => (item['id'] ?? item['skillId']) as String? ?? '')
                .where((id) => id.isNotEmpty)
                .toList(growable: false)
          : const [],
      skillNames: skills is List
          ? skills
                .whereType<Map>()
                .map(
                  (item) => (
                    bn: nested(item, 'nameBn', 'name_bn'),
                    en: nested(item, 'nameEn', 'name_en'),
                  ),
                )
                .toList(growable: false)
          : const [],
      mentor: mentor is Map
          ? LearningMentor.fromJson(Map<String, dynamic>.from(mentor))
          : null,
      viewerApplicationId: application is Map
          ? application['id'] as String?
          : null,
      viewerApplicationStatus: application is Map
          ? application['status'] as String?
          : read('viewerApplicationStatus', 'viewer_application_status')
                as String?,
      applicationsCount: (read('applicationsCount') as num?)?.toInt(),
      isMine: read('isMine') == true || read('viewerIsMentor') == true,
      closedToApplications: read('closedToApplications') == true,
    );
  }

  /// The mentor stopped new applications; enrolled learners carry on.
  final bool closedToApplications;

  /// For the mentors own list.
  final int? applicationsCount;
  final String areaNameBn;
  final String areaNameEn;
  final String categoryNameBn;
  final String categoryNameEn;
  final DeliveryMode deliveryMode;
  final String description;
  final DateTime? endsAt;
  final Money? feePoisha;
  final bool flexibleHours;
  final String id;
  final bool isMine;
  final LearningKind kind;
  final LearningMentor? mentor;
  final int? seats;
  final int? seatsLeft;
  final List<String> skillIds;
  final List<({String bn, String en})> skillNames;
  final DateTime? startsAt;
  final String status;
  final Money? stipendPoisha;
  final ParticipantTerms terms;
  final String title;
  final String? viewerApplicationStatus;

  /// For withdrawing: the viewer own application on this opportunity.
  final String? viewerApplicationId;

  /// An application the learner may still take back.
  bool get canWithdraw =>
      viewerApplicationId != null &&
      (viewerApplicationStatus == 'PENDING' ||
          viewerApplicationStatus == 'SHORTLISTED');

  String areaFor(String language) =>
      language == 'en' && areaNameEn.isNotEmpty ? areaNameEn : areaNameBn;

  String categoryFor(String language) =>
      language == 'en' && categoryNameEn.isNotEmpty
      ? categoryNameEn
      : categoryNameBn;

  /// A withdrawn application can be sent again; anything else counts.
  bool get hasApplied =>
      viewerApplicationStatus != null && viewerApplicationStatus != 'WITHDRAWN';
}

/// What a mentor fills in to publish a learning opportunity.
class LearningDraft {
  const LearningDraft({
    required this.kind,
    required this.title,
    required this.description,
    required this.categoryId,
    required this.skillIds,
    required this.locationId,
    required this.terms,
    required this.seats,
    required this.startsAt,
    required this.endsAt,
    required this.deliveryMode,
    this.feeTaka,
    this.stipendTaka,
    this.flexibleHours = false,
  });

  final String categoryId;
  final DeliveryMode deliveryMode;
  final String description;
  final DateTime endsAt;
  final int? feeTaka;
  final bool flexibleHours;
  final LearningKind kind;
  final String locationId;
  final int seats;
  final List<String> skillIds;
  final DateTime startsAt;
  final int? stipendTaka;
  final ParticipantTerms terms;
  final String title;

  Map<String, dynamic> toJson() => {
    'opportunityType': kind.wire,
    'title': title.trim(),
    'description': description.trim(),
    'categoryId': categoryId,
    'skillIds': skillIds,
    'locationId': locationId,
    'participantTerms': terms.wire,
    if (terms == ParticipantTerms.paidByParticipant && feeTaka != null)
      'participantFeePoisha': '${feeTaka! * 100}',
    if (terms == ParticipantTerms.stipend && stipendTaka != null)
      'stipendPoisha': '${stipendTaka! * 100}',
    'seats': seats,
    'startsAt': startsAt.toUtc().toIso8601String(),
    'endsAt': endsAt.toUtc().toIso8601String(),
    'workArrangement': deliveryMode.wire,
    'flexibleHours': flexibleHours,
  };
}

/// Someone asking to join a mentors training or apprenticeship.
class LearningApplication {
  const LearningApplication({
    required this.id,
    required this.status,
    required this.learnerName,
    this.message,
    this.appliedAt,
    this.trustLevel,
  });

  factory LearningApplication.fromJson(Map<String, dynamic> json) {
    final learner = json['learner'];
    return LearningApplication(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? '',
      message: json['message'] as String?,
      appliedAt: DateTime.tryParse(json['appliedAt'] as String? ?? ''),
      learnerName: learner is Map
          ? learner['displayName'] as String? ?? ''
          : '',
      trustLevel: learner is Map ? learner['trustLevel'] as String? : null,
    );
  }

  final DateTime? appliedAt;
  final String id;
  final String learnerName;
  final String? message;
  final String status;
  final String? trustLevel;

  bool get isPending => status == 'PENDING';
}

/// One learning session the mentor recorded.
class LearningSession {
  const LearningSession({
    required this.id,
    required this.heldAt,
    required this.minutes,
    required this.topic,
    this.notes,
    this.learnerConfirmedAt,
  });

  factory LearningSession.fromJson(Map<String, dynamic> json) =>
      LearningSession(
        id: json['id'] as String? ?? '',
        heldAt:
            DateTime.tryParse(json['heldAt'] as String? ?? '') ??
            DateTime.now(),
        minutes: (json['minutes'] as num?)?.toInt() ?? 0,
        topic: json['topic'] as String? ?? '',
        notes: json['notes'] as String?,
        learnerConfirmedAt: DateTime.tryParse(
          json['learnerConfirmedAt'] as String? ?? '',
        ),
      );

  final DateTime heldAt;
  final String id;
  final DateTime? learnerConfirmedAt;
  final int minutes;
  final String? notes;
  final String topic;

  bool get confirmed => learnerConfirmedAt != null;
}

/// The practical certificate a mentor issues when the learning is done.
class CompletionRecord {
  const CompletionRecord({
    required this.code,
    required this.issuedAt,
    required this.valid,
    required this.verifyPath,
  });

  static CompletionRecord? maybe(Object? value) => value is Map
      ? CompletionRecord(
          code: value['code'] as String? ?? '',
          issuedAt:
              DateTime.tryParse(value['issuedAt'] as String? ?? '') ??
              DateTime.now(),
          valid: value['status'] != 'REVOKED',
          verifyPath: value['verifyPath'] as String? ?? '',
        )
      : null;

  final String code;
  final DateTime issuedAt;
  final bool valid;
  final String verifyPath;
}

/// The terms the learner agreed to, frozen when the mentor accepted.
class LearningContract {
  const LearningContract({
    required this.terms,
    this.version,
    this.feePoisha,
    this.stipendPoisha,
    this.startsAt,
    this.endsAt,
    this.flexibleHours = false,
    this.deliveryEn = '',
    this.deliveryBn = '',
    this.acceptedAt,
  });

  static LearningContract? maybe(Object? value) {
    if (value is! Map) return null;
    final schedule = value['schedule'];
    final delivery = value['deliveryMode'];
    return LearningContract(
      version: (value['version'] as num?)?.toInt(),
      terms: ParticipantTerms.parse(value['terms']),
      feePoisha: Money.tryParse(value['participantFeePoisha']),
      stipendPoisha: Money.tryParse(value['stipendPoisha']),
      startsAt: schedule is Map
          ? DateTime.tryParse(schedule['startsAt'] as String? ?? '')
          : null,
      endsAt: schedule is Map
          ? DateTime.tryParse(schedule['endsAt'] as String? ?? '')
          : null,
      flexibleHours: schedule is Map && schedule['flexibleHours'] == true,
      deliveryEn: delivery is Map ? delivery['en'] as String? ?? '' : '',
      deliveryBn: delivery is Map ? delivery['bn'] as String? ?? '' : '',
      acceptedAt: DateTime.tryParse(value['acceptedAt'] as String? ?? ''),
    );
  }

  final DateTime? acceptedAt;
  final String deliveryBn;
  final String deliveryEn;
  final DateTime? endsAt;
  final Money? feePoisha;
  final bool flexibleHours;
  final DateTime? startsAt;
  final Money? stipendPoisha;
  final ParticipantTerms terms;
  final int? version;

  String deliveryFor(String language) =>
      language == 'en' && deliveryEn.isNotEmpty ? deliveryEn : deliveryBn;
}

/// A learner taken on by a mentor, seen from either side.
class LearningEnrolment {
  const LearningEnrolment({
    required this.id,
    required this.isMentor,
    required this.status,
    required this.opportunityId,
    required this.title,
    required this.kind,
    required this.learnerName,
    this.contract,
    this.sessions = const [],
    this.sessionsRecorded = 0,
    this.sessionsConfirmed = 0,
    this.minutesTotal = 0,
    this.completion,
    this.withdrawnAt,
    this.learnerUserId,
    this.mentorUserId,
  });

  factory LearningEnrolment.fromJson(Map<String, dynamic> json) {
    final opportunity = json['opportunity'];
    final learner = json['learner'];
    final progress = json['progress'];
    int count(String key) =>
        progress is Map ? (progress[key] as num?)?.toInt() ?? 0 : 0;
    final sessions =
        (json['sessions'] as List?)
            ?.whereType<Map>()
            .map((item) => LearningSession.fromJson(Map.from(item)))
            .toList(growable: false) ??
        const <LearningSession>[];
    return LearningEnrolment(
      id: json['id'] as String? ?? '',
      isMentor: json['role'] == 'MENTOR',
      status: json['status'] as String? ?? '',
      opportunityId: opportunity is Map
          ? opportunity['id'] as String? ?? ''
          : '',
      title: opportunity is Map ? opportunity['title'] as String? ?? '' : '',
      kind: LearningKind.parse(
        opportunity is Map ? opportunity['opportunityType'] : null,
      ),
      learnerName: learner is Map
          ? learner['displayName'] as String? ?? ''
          : '',
      contract: LearningContract.maybe(json['contract']),
      sessions: sessions,
      sessionsRecorded: progress is Map
          ? count('sessionsRecorded')
          : sessions.length,
      sessionsConfirmed: progress is Map
          ? count('sessionsConfirmed')
          : sessions.where((item) => item.confirmed).length,
      minutesTotal: progress is Map
          ? count('minutesTotal')
          : sessions.fold(0, (sum, item) => sum + item.minutes),
      completion: CompletionRecord.maybe(json['completionRecord']),
      withdrawnAt: DateTime.tryParse(json['withdrawnAt'] as String? ?? ''),
      learnerUserId: learner is Map ? learner['userId'] as String? : null,
      mentorUserId: json['mentorUserId'] as String?,
    );
  }

  final String? learnerUserId;
  final String? mentorUserId;

  /// The other person in this enrolment, for a chat.
  String? get otherUserId => isMentor ? learnerUserId : mentorUserId;

  /// Set when the learner left.
  final DateTime? withdrawnAt;

  final CompletionRecord? completion;
  final LearningContract? contract;
  final String id;
  final bool isMentor;
  final LearningKind kind;
  final String learnerName;
  final int minutesTotal;
  final String opportunityId;
  final List<LearningSession> sessions;
  final int sessionsConfirmed;
  final int sessionsRecorded;
  final String status;
  final String title;

  bool get isActive => status == 'CONFIRMED';
  bool get isCompleted => status == 'COMPLETED' || completion != null;
}

/// Filters for Explore → Learn.
class LearningFilter {
  const LearningFilter({
    this.kind,
    this.terms,
    this.mode,
    this.skillId,
    this.locationId,
  });

  final LearningKind? kind;
  final DeliveryMode? mode;
  final ParticipantTerms? terms;
  final String? skillId;
  final String? locationId;

  @override
  bool operator ==(Object other) =>
      other is LearningFilter &&
      other.kind == kind &&
      other.terms == terms &&
      other.mode == mode &&
      other.skillId == skillId &&
      other.locationId == locationId;

  @override
  int get hashCode => Object.hash(kind, terms, mode, skillId, locationId);
}

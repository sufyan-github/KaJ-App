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
    this.applicationsCount,
    this.skillIds = const [],
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
      viewerApplicationStatus: application is Map
          ? application['status'] as String?
          : read('viewerApplicationStatus', 'viewer_application_status')
                as String?,
      applicationsCount: (read('applicationsCount') as num?)?.toInt(),
      isMine: read('isMine') == true || read('viewerIsMentor') == true,
    );
  }

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

  String areaFor(String language) =>
      language == 'en' && areaNameEn.isNotEmpty ? areaNameEn : areaNameBn;

  String categoryFor(String language) =>
      language == 'en' && categoryNameEn.isNotEmpty
      ? categoryNameEn
      : categoryNameBn;

  bool get hasApplied => viewerApplicationStatus != null;
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

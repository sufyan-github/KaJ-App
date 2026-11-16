/// Where a person stands as a mentor. Only an admin approves a mentor.
enum MentorStatus {
  none,
  pending,
  approved,
  rejected,
  suspended;

  static MentorStatus parse(Object? value) => switch (value) {
    final String text => MentorStatus.values.firstWhere(
      (item) => item.name.toUpperCase() == text.toUpperCase(),
      orElse: () => none,
    ),
    _ => none,
  };
}

class MentorSkill {
  const MentorSkill({
    required this.skillId,
    required this.nameEn,
    required this.nameBn,
  });

  factory MentorSkill.fromJson(Map<String, dynamic> json) => MentorSkill(
    skillId: (json['skillId'] ?? json['id']) as String? ?? '',
    nameEn: json['nameEn'] as String? ?? '',
    nameBn: json['nameBn'] as String? ?? '',
  );

  final String nameBn;
  final String nameEn;
  final String skillId;

  String nameFor(String languageCode) =>
      languageCode == 'en' && nameEn.isNotEmpty ? nameEn : nameBn;
}

/// The persons mentor application and settings.
class MentorProfile {
  const MentorProfile({
    this.status = MentorStatus.none,
    this.accepting = false,
    this.bio = '',
    this.yearsExperience,
    this.skills = const [],
    this.rejectionReason,
  });

  factory MentorProfile.fromJson(Map<String, dynamic> json) => MentorProfile(
    status: MentorStatus.parse(json['status'] ?? json['mentorStatus']),
    accepting: json['accepting'] == true || json['mentorAccepting'] == true,
    bio: (json['bio'] ?? json['mentorBio']) as String? ?? '',
    yearsExperience: switch (json['yearsExperience'] ??
        json['mentorYearsExperience']) {
      final num value => value.toInt(),
      final String value => int.tryParse(value),
      _ => null,
    },
    skills:
        (json['skills'] as List?)
            ?.whereType<Map>()
            .map(
              (item) => MentorSkill.fromJson(Map<String, dynamic>.from(item)),
            )
            .where((item) => item.skillId.isNotEmpty)
            .toList(growable: false) ??
        const [],
    rejectionReason: switch (json['application']) {
      final Map application => application['rejectionReason'] as String?,
      _ => json['rejectionReason'] as String?,
    },
  );

  final bool accepting;
  final String bio;
  final String? rejectionReason;
  final List<MentorSkill> skills;
  final MentorStatus status;
  final int? yearsExperience;

  bool get canApply =>
      status == MentorStatus.none || status == MentorStatus.rejected;
}

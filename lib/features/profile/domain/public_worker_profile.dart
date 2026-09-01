class PublicWorkerProfile {
  const PublicWorkerProfile({
    required this.id,
    required this.displayName,
    required this.trustLevel,
    required this.ratingAverage,
    required this.ratingCount,
    required this.completedJobsCount,
    required this.skills,
    required this.availability,
    this.badges = const [],
    this.photoUrl,
    this.areaNameBn,
  });

  final List<String> availability;
  final List<PublicWorkerBadge> badges;
  final String? areaNameBn;
  final int completedJobsCount;
  final String displayName;
  final String id;
  final String? photoUrl;
  final String ratingAverage;
  final int ratingCount;
  final List<PublicWorkerSkill> skills;
  final String trustLevel;
}

class PublicWorkerBadge {
  const PublicWorkerBadge({required this.slug, required this.nameBn});
  final String slug;
  final String nameBn;
}

class PublicWorkerSkill {
  const PublicWorkerSkill({
    required this.id,
    required this.nameBn,
    required this.level,
    required this.isVerified,
  });

  final String id;
  final bool isVerified;
  final String level;
  final String nameBn;
}

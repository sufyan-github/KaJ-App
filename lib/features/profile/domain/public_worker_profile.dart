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
    this.photoUrl,
    this.areaNameBn,
  });

  final List<String> availability;
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

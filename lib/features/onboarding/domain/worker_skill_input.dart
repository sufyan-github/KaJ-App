/// The plain-language experience answer asked for each chosen skill.
enum SkillExperience {
  never('BEGINNER', 0),
  aLittle('BEGINNER', 0.5),
  regularly('INTERMEDIATE', 2),
  expert('EXPERT', 5);

  const SkillExperience(this.level, this.years);

  final String level;
  final double years;

  /// Reads a stored level and years back into the closest answer, so an
  /// edit screen can show what the worker said before.
  static SkillExperience from(String level, double? years) {
    final value = years ?? 0;
    if (level == 'EXPERT' || level == 'ADVANCED' || value >= 3) return expert;
    if (level == 'INTERMEDIATE' || value >= 1) return regularly;
    if (value > 0) return aLittle;
    return never;
  }
}

class WorkerSkillInput {
  const WorkerSkillInput({
    required this.skillId,
    required this.level,
    this.years,
    this.hasPriorTraining = false,
  });

  factory WorkerSkillInput.fromExperience(
    String skillId,
    SkillExperience experience, {
    bool hasPriorTraining = false,
  }) => WorkerSkillInput(
    skillId: skillId,
    level: experience.level,
    years: experience.years,
    hasPriorTraining: hasPriorTraining,
  );

  factory WorkerSkillInput.fromJson(Map<String, dynamic> json) =>
      WorkerSkillInput(
        skillId: json['skillId'] as String? ?? '',
        level: json['level'] as String? ?? 'BEGINNER',
        years: switch (json['years']) {
          final num number => number.toDouble(),
          final String text => double.tryParse(text),
          _ => null,
        },
        hasPriorTraining: json['hasPriorTraining'] == true,
      );

  final bool hasPriorTraining;
  final String level;
  final String skillId;
  final double? years;

  SkillExperience get experience => SkillExperience.from(level, years);

  WorkerSkillInput copyWith({
    String? level,
    double? years,
    bool? hasPriorTraining,
  }) => WorkerSkillInput(
    skillId: skillId,
    level: level ?? this.level,
    years: years ?? this.years,
    hasPriorTraining: hasPriorTraining ?? this.hasPriorTraining,
  );

  Map<String, dynamic> toJson() => {
    'skillId': skillId,
    'level': level,
    'years': ?years,
    'hasPriorTraining': hasPriorTraining,
  };

  @override
  bool operator ==(Object other) =>
      other is WorkerSkillInput &&
      other.skillId == skillId &&
      other.level == level &&
      other.years == years &&
      other.hasPriorTraining == hasPriorTraining;

  @override
  int get hashCode => Object.hash(skillId, level, years, hasPriorTraining);

  @override
  String toString() =>
      'WorkerSkillInput($skillId, $level, $years, $hasPriorTraining)';
}

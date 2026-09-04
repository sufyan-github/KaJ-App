class AvailabilityRule {
  const AvailabilityRule({
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
    this.id,
  });

  factory AvailabilityRule.fromJson(Map<String, dynamic> json) =>
      AvailabilityRule(
        id: json['id'] as String?,
        dayOfWeek: (json['dayOfWeek'] as num).toInt(),
        startTime: json['startTime'] as String,
        endTime: json['endTime'] as String,
      );

  final int dayOfWeek;
  final String endTime;
  final String? id;
  final String startTime;

  Map<String, dynamic> toJson() => {
    'dayOfWeek': dayOfWeek,
    'startTime': startTime,
    'endTime': endTime,
  };
}

class AvailabilitySchedule {
  const AvailabilitySchedule({required this.rules});

  factory AvailabilitySchedule.fromJson(Map<String, dynamic> json) {
    final rawRules = json['rules'];
    return AvailabilitySchedule(
      rules: rawRules is List
          ? rawRules
                .whereType<Map>()
                .map(
                  (item) => AvailabilityRule.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList(growable: false)
          : const [],
    );
  }

  final List<AvailabilityRule> rules;
}

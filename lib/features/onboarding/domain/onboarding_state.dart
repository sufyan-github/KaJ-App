enum KaajRole { customer, worker }

class OnboardingState {
  const OnboardingState({
    this.started = false,
    this.complete = false,
    this.step = 0,
    this.displayName = '',
    this.role,
    this.locationId,
    this.skillIds = const [],
    this.availableDays = const [],
    this.availableStartTime = '18:00',
    this.availableEndTime = '22:00',
  });

  factory OnboardingState.fromJson(Map<dynamic, dynamic> json) {
    final roleName = json['role'];
    return OnboardingState(
      availableDays: (json['availableDays'] as List? ?? const [])
          .whereType<num>()
          .map((item) => item.toInt())
          .toList(growable: false),
      availableStartTime: json['availableStartTime'] as String? ?? '18:00',
      availableEndTime: json['availableEndTime'] as String? ?? '22:00',
      complete: json['complete'] == true,
      displayName: json['displayName'] as String? ?? '',
      locationId: json['locationId'] as String?,
      role: roleName is String
          ? KaajRole.values.where((item) => item.name == roleName).firstOrNull
          : null,
      skillIds: (json['skillIds'] as List? ?? const [])
          .whereType<String>()
          .toList(growable: false),
      started: json['started'] == true,
      step: json['step'] as int? ?? 0,
    );
  }

  final List<int> availableDays;
  final String availableEndTime;
  final String availableStartTime;
  final bool complete;
  final String displayName;
  final String? locationId;
  final KaajRole? role;
  final List<String> skillIds;
  final bool started;
  final int step;

  OnboardingState copyWith({
    List<int>? availableDays,
    String? availableEndTime,
    String? availableStartTime,
    bool? complete,
    String? displayName,
    String? locationId,
    KaajRole? role,
    List<String>? skillIds,
    bool? started,
    int? step,
  }) => OnboardingState(
    availableDays: availableDays ?? this.availableDays,
    availableEndTime: availableEndTime ?? this.availableEndTime,
    availableStartTime: availableStartTime ?? this.availableStartTime,
    complete: complete ?? this.complete,
    displayName: displayName ?? this.displayName,
    locationId: locationId ?? this.locationId,
    role: role ?? this.role,
    skillIds: skillIds ?? this.skillIds,
    started: started ?? this.started,
    step: step ?? this.step,
  );

  Map<String, dynamic> toJson() => {
    'availableDays': availableDays,
    'availableEndTime': availableEndTime,
    'availableStartTime': availableStartTime,
    'complete': complete,
    'displayName': displayName,
    'locationId': locationId,
    'role': role?.name,
    'skillIds': skillIds,
    'started': started,
    'step': step,
  };
}

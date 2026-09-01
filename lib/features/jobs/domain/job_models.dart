class JobSummary {
  const JobSummary({
    required this.id,
    required this.title,
    required this.description,
    required this.categoryName,
    required this.locationName,
    required this.status,
    required this.skills,
    this.startsAt,
    this.endsAt,
    this.budgetMinPoisha,
    this.budgetMaxPoisha,
  });

  factory JobSummary.fromJson(Map<String, dynamic> json) {
    String nestedName(Object? value) {
      if (value is Map) return value['name_bn'] as String? ?? '';
      return '';
    }

    final rawSkills = json['skills'];
    return JobSummary(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
      categoryName: nestedName(json['category']),
      locationName: nestedName(json['location']),
      status: json['status'] as String? ?? '',
      startsAt: DateTime.tryParse(json['starts_at'] as String? ?? ''),
      endsAt: DateTime.tryParse(json['ends_at'] as String? ?? ''),
      budgetMinPoisha: json['budget_min_poisha']?.toString(),
      budgetMaxPoisha: json['budget_max_poisha']?.toString(),
      skills: rawSkills is List
          ? rawSkills
                .whereType<Map>()
                .map((item) => item['skill'])
                .whereType<Map>()
                .map((skill) => skill['name_bn'] as String? ?? '')
                .where((name) => name.isNotEmpty)
                .toList(growable: false)
          : const [],
    );
  }

  final String? budgetMaxPoisha;
  final String? budgetMinPoisha;
  final String categoryName;
  final String description;
  final DateTime? endsAt;
  final String id;
  final String locationName;
  final List<String> skills;
  final DateTime? startsAt;
  final String status;
  final String title;
}

class WorkerSlot {
  const WorkerSlot({required this.startsAt, required this.endsAt});

  factory WorkerSlot.fromJson(Map<String, dynamic> json) => WorkerSlot(
    startsAt: DateTime.parse(json['startsAt'] as String),
    endsAt: DateTime.parse(json['endsAt'] as String),
  );

  final DateTime endsAt;
  final DateTime startsAt;
}

class AssignmentSummary {
  const AssignmentSummary({
    required this.id,
    required this.title,
    required this.status,
    required this.isWorker,
    required this.isPoster,
    this.startsAt,
    this.endsAt,
  });

  factory AssignmentSummary.fromJson(Map<String, dynamic> json) =>
      AssignmentSummary(
        id: json['id'] as String,
        title: json['title'] as String? ?? 'কাজ',
        status: json['status'] as String? ?? '',
        isWorker: json['isWorker'] == true,
        isPoster: json['isPoster'] == true,
        startsAt: DateTime.tryParse(json['agreedStartsAt'] as String? ?? ''),
        endsAt: DateTime.tryParse(json['agreedEndsAt'] as String? ?? ''),
      );

  final DateTime? endsAt;
  final String id;
  final bool isPoster;
  final bool isWorker;
  final DateTime? startsAt;
  final String status;
  final String title;
}

class JobApplicationSummary {
  const JobApplicationSummary({
    required this.id,
    required this.status,
    required this.workerUserId,
    this.message,
    this.proposedPricePoisha,
    this.startsAt,
    this.endsAt,
  });

  factory JobApplicationSummary.fromJson(Map<String, dynamic> json) =>
      JobApplicationSummary(
        id: json['id'] as String,
        status: json['status'] as String? ?? '',
        workerUserId: json['workerUserId'] as String? ?? '',
        message: json['message'] as String?,
        proposedPricePoisha: json['proposedPricePoisha'] as String?,
        startsAt: DateTime.tryParse(json['proposedStartsAt'] as String? ?? ''),
        endsAt: DateTime.tryParse(json['proposedEndsAt'] as String? ?? ''),
      );

  final DateTime? endsAt;
  final String id;
  final String? message;
  final String? proposedPricePoisha;
  final DateTime? startsAt;
  final String status;
  final String workerUserId;
}

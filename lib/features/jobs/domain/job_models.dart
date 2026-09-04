class JobSummary {
  const JobSummary({
    required this.id,
    required this.title,
    required this.description,
    required this.categoryId,
    required this.categoryName,
    required this.locationName,
    required this.status,
    required this.skills,
    this.categoryNameEn,
    this.locationNameEn,
    this.skillsEn = const [],
    this.startsAt,
    this.endsAt,
    this.budgetMinPoisha,
    this.budgetMaxPoisha,
    this.matchScore,
    this.matchReasons = const [],
    this.timeCompatibility,
    this.availabilityCoverage,
  });

  factory JobSummary.fromJson(Map<String, dynamic> json) {
    String nestedName(Object? value, String key) {
      if (value is Map) return value[key] as String? ?? '';
      return '';
    }

    String nestedId(Object? value) {
      if (value is Map) return value['id'] as String? ?? '';
      return '';
    }

    final rawSkills = json['skills'];
    return JobSummary(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
      categoryId: nestedId(json['category']),
      categoryName: nestedName(json['category'], 'name_bn'),
      categoryNameEn: nestedName(json['category'], 'name_en'),
      locationName: nestedName(json['location'], 'name_bn'),
      locationNameEn: nestedName(json['location'], 'name_en'),
      status: json['status'] as String? ?? '',
      startsAt: DateTime.tryParse(json['starts_at'] as String? ?? ''),
      endsAt: DateTime.tryParse(json['ends_at'] as String? ?? ''),
      budgetMinPoisha: json['budget_min_poisha']?.toString(),
      budgetMaxPoisha: json['budget_max_poisha']?.toString(),
      matchScore: (json['matchScore'] as num?)?.toInt(),
      timeCompatibility: json['timeCompatibility'] as String?,
      availabilityCoverage: (json['availabilityCoverage'] as num?)?.toDouble(),
      matchReasons:
          (json['matchReasons'] as List?)?.whereType<String>().toList(
            growable: false,
          ) ??
          const [],
      skills: rawSkills is List
          ? rawSkills
                .whereType<Map>()
                .map((item) => item['skill'])
                .whereType<Map>()
                .map((skill) => skill['name_bn'] as String? ?? '')
                .where((name) => name.isNotEmpty)
                .toList(growable: false)
          : const [],
      skillsEn: rawSkills is List
          ? rawSkills
                .whereType<Map>()
                .map((item) => item['skill'])
                .whereType<Map>()
                .map((skill) => skill['name_en'] as String? ?? '')
                .where((name) => name.isNotEmpty)
                .toList(growable: false)
          : const [],
    );
  }

  final String? budgetMaxPoisha;
  final String? budgetMinPoisha;
  final double? availabilityCoverage;
  final String categoryId;
  final String categoryName;
  final String? categoryNameEn;
  final String description;
  final DateTime? endsAt;
  final String id;
  final String locationName;
  final String? locationNameEn;
  final List<String> matchReasons;
  final int? matchScore;
  final List<String> skills;
  final List<String> skillsEn;
  final DateTime? startsAt;
  final String status;
  final String? timeCompatibility;
  final String title;

  bool get isTimeAvailable => timeCompatibility == 'AVAILABLE';
  bool get isTimeUnavailable => timeCompatibility == 'UNAVAILABLE';

  String categoryNameFor(String languageCode) => languageCode == 'en'
      ? categoryNameEn?.isNotEmpty == true
            ? categoryNameEn!
            : categoryName
      : categoryName;

  String locationNameFor(String languageCode) => languageCode == 'en'
      ? locationNameEn?.isNotEmpty == true
            ? locationNameEn!
            : locationName
      : locationName;

  List<String> skillsFor(String languageCode) =>
      languageCode == 'en' && skillsEn.isNotEmpty ? skillsEn : skills;
}

class SuggestedWorker {
  const SuggestedWorker({
    required this.id,
    required this.displayName,
    required this.ratingAverage,
    required this.experienceYears,
    required this.matchScore,
    required this.matchReasons,
    required this.skills,
    this.skillsEn = const [],
  });

  factory SuggestedWorker.fromJson(Map<String, dynamic> json) =>
      SuggestedWorker(
        id: json['id'] as String,
        displayName: json['displayName'] as String? ?? 'কর্মী',
        ratingAverage: json['ratingAverage']?.toString() ?? '0',
        experienceYears: (json['experienceYears'] as num?)?.toInt() ?? 0,
        matchScore: (json['matchScore'] as num?)?.toInt() ?? 0,
        matchReasons:
            (json['matchReasons'] as List?)?.whereType<String>().toList() ??
            const [],
        skills:
            (json['skills'] as List?)
                ?.whereType<Map>()
                .map((item) => item['nameBn'] as String? ?? '')
                .where((item) => item.isNotEmpty)
                .toList() ??
            const [],
        skillsEn:
            (json['skills'] as List?)
                ?.whereType<Map>()
                .map((item) => item['nameEn'] as String? ?? '')
                .where((item) => item.isNotEmpty)
                .toList() ??
            const [],
      );

  final String displayName;
  final int experienceYears;
  final String id;
  final List<String> matchReasons;
  final int matchScore;
  final String ratingAverage;
  final List<String> skills;
  final List<String> skillsEn;

  List<String> skillsFor(String languageCode) =>
      languageCode == 'en' && skillsEn.isNotEmpty ? skillsEn : skills;
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
    this.jobStatus,
    this.confirmationDeadlineAt,
    this.submittedAt,
    this.completionDueAt,
    this.workerUserId,
    this.posterUserId,
    this.jobId,
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
        jobStatus: json['jobStatus'] as String?,
        confirmationDeadlineAt: DateTime.tryParse(
          json['confirmationDeadlineAt'] as String? ?? '',
        ),
        submittedAt: DateTime.tryParse(json['submittedAt'] as String? ?? ''),
        completionDueAt: DateTime.tryParse(
          json['completionDueAt'] as String? ?? '',
        ),
        workerUserId: json['workerUserId'] as String?,
        posterUserId: json['posterUserId'] as String?,
        jobId: json['jobId'] as String?,
      );

  final DateTime? endsAt;
  final DateTime? completionDueAt;
  final DateTime? confirmationDeadlineAt;
  final String id;
  final bool isPoster;
  final bool isWorker;
  final String? jobStatus;
  final DateTime? startsAt;
  final String status;
  final DateTime? submittedAt;
  final String title;
  final String? workerUserId;
  final String? posterUserId;
  final String? jobId;
}

class AssignmentReview {
  const AssignmentReview({
    required this.id,
    required this.reviewerName,
    required this.rating,
    required this.createdAt,
    this.comment,
  });

  factory AssignmentReview.fromJson(Map<String, dynamic> json) =>
      AssignmentReview(
        id: json['id'] as String,
        reviewerName: json['reviewerName'] as String? ?? 'KAAJ ব্যবহারকারী',
        rating: (json['rating'] as num?)?.toInt() ?? 0,
        comment: json['comment'] as String?,
        createdAt:
            DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
      );

  final String id;
  final String reviewerName;
  final int rating;
  final String? comment;
  final DateTime createdAt;
}

class AssignmentReviewState {
  const AssignmentReviewState({
    required this.canReview,
    required this.revealed,
    required this.windowEndsAt,
    this.myReview,
    this.receivedReview,
  });

  factory AssignmentReviewState.fromJson(Map<String, dynamic> json) =>
      AssignmentReviewState(
        canReview: json['canReview'] == true,
        revealed: json['revealed'] == true,
        windowEndsAt:
            DateTime.tryParse(json['windowEndsAt'] as String? ?? '') ??
            DateTime.now(),
        myReview: json['myReview'] is Map
            ? AssignmentReview.fromJson(Map.from(json['myReview'] as Map))
            : null,
        receivedReview: json['receivedReview'] is Map
            ? AssignmentReview.fromJson(Map.from(json['receivedReview'] as Map))
            : null,
      );

  final bool canReview;
  final bool revealed;
  final DateTime windowEndsAt;
  final AssignmentReview? myReview;
  final AssignmentReview? receivedReview;
}

class FavoriteWorker {
  const FavoriteWorker({
    required this.userId,
    required this.displayName,
    required this.ratingAverage,
  });

  factory FavoriteWorker.fromJson(Map<String, dynamic> json) => FavoriteWorker(
    userId: json['userId'] as String,
    displayName: json['displayName'] as String? ?? 'কর্মী',
    ratingAverage: json['ratingAverage']?.toString() ?? '0',
  );

  final String userId;
  final String displayName;
  final String ratingAverage;
}

class AssignmentTimelineItem {
  const AssignmentTimelineItem({required this.status, required this.at});
  factory AssignmentTimelineItem.fromJson(Map<String, dynamic> json) =>
      AssignmentTimelineItem(
        status: json['status'] as String? ?? '',
        at: DateTime.tryParse(json['at'] as String? ?? '') ?? DateTime.now(),
      );
  final DateTime at;
  final String status;
}

class AssignmentDetail {
  const AssignmentDetail({
    required this.summary,
    required this.description,
    required this.locationName,
    required this.timeline,
    this.contractVersion,
  });

  factory AssignmentDetail.fromJson(Map<String, dynamic> json) =>
      AssignmentDetail(
        summary: AssignmentSummary.fromJson(json),
        description: json['description'] as String? ?? '',
        locationName: json['locationName'] as String? ?? '',
        contractVersion: (json['contractVersion'] as num?)?.toInt(),
        timeline:
            (json['timeline'] as List?)
                ?.whereType<Map>()
                .map((item) => AssignmentTimelineItem.fromJson(Map.from(item)))
                .toList(growable: false) ??
            const [],
      );
  final int? contractVersion;
  final String description;
  final String locationName;
  final AssignmentSummary summary;
  final List<AssignmentTimelineItem> timeline;
}

class CancellationPreview {
  const CancellationPreview({
    required this.summaryBn,
    required this.summaryEn,
    required this.feePoisha,
    required this.refundPoisha,
    required this.needsAdminReview,
  });
  factory CancellationPreview.fromJson(Map<String, dynamic> json) =>
      CancellationPreview(
        summaryBn: json['summaryBn'] as String? ?? '',
        summaryEn: json['summaryEn'] as String? ?? '',
        feePoisha: json['feePoisha']?.toString() ?? '0',
        refundPoisha: json['refundPoisha']?.toString() ?? '0',
        needsAdminReview: json['needsAdminReview'] == true,
      );
  final String feePoisha;
  final bool needsAdminReview;
  final String refundPoisha;
  final String summaryBn;
  final String summaryEn;

  String summaryFor(String languageCode) =>
      languageCode == 'en' && summaryEn.isNotEmpty ? summaryEn : summaryBn;
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

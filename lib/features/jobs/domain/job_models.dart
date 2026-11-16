import '../../../core/formatting/money.dart';

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
      budgetMinPoisha: Money.tryParse(json['budget_min_poisha']),
      budgetMaxPoisha: Money.tryParse(json['budget_max_poisha']),
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

  final Money? budgetMaxPoisha;
  final Money? budgetMinPoisha;
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
    this.canDispute,
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
        canDispute: json['canDispute'] is bool
            ? json['canDispute'] as bool
            : null,
      );

  /// From the server when it says whether a dispute can be opened; null on
  /// older servers, which fall back to the job-status rule.
  final bool? canDispute;
  final DateTime? endsAt;
  final DateTime? completionDueAt;
  final DateTime? confirmationDeadlineAt;

  /// What the list should say: once the booking is confirmed, the job's own
  /// progress (in progress, in review, completed) is the news, not
  /// "confirmed".
  String get displayStatus =>
      status == 'CONFIRMED' && (jobStatus?.isNotEmpty ?? false)
      ? jobStatus!
      : status;
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
    this.payment,
  });

  factory AssignmentDetail.fromJson(Map<String, dynamic> json) =>
      AssignmentDetail(
        summary: AssignmentSummary.fromJson(json),
        description: json['description'] as String? ?? '',
        locationName: json['locationName'] as String? ?? '',
        contractVersion: (json['contractVersion'] as num?)?.toInt(),
        payment: json['payment'] is Map
            ? AssignmentPayment.fromJson(
                Map<String, dynamic>.from(json['payment'] as Map),
              )
            : null,
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
  final AssignmentPayment? payment;
  final AssignmentSummary summary;
  final List<AssignmentTimelineItem> timeline;
}

class AssignmentPayment {
  const AssignmentPayment({
    required this.id,
    required this.agreedPoisha,
    required this.method,
    required this.status,
    this.cashRecordedAt,
    this.disputedAt,
  });

  factory AssignmentPayment.fromJson(Map<String, dynamic> json) =>
      AssignmentPayment(
        id: json['id'] as String? ?? '',
        agreedPoisha: Money.parseOrZero(json['agreedPoisha']),
        method: json['method'] as String? ?? 'CASH_ON_COMPLETION',
        status: json['status'] as String? ?? 'PENDING',
        cashRecordedAt: DateTime.tryParse(
          json['cashRecordedAt'] as String? ?? '',
        ),
        disputedAt: DateTime.tryParse(json['disputedAt'] as String? ?? ''),
      );

  final Money agreedPoisha;
  final DateTime? cashRecordedAt;
  final DateTime? disputedAt;
  final String id;
  final String method;
  final String status;
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
        feePoisha: Money.parseOrZero(json['feePoisha']),
        refundPoisha: Money.parseOrZero(json['refundPoisha']),
        needsAdminReview: json['needsAdminReview'] == true,
      );
  final Money feePoisha;
  final bool needsAdminReview;
  final Money refundPoisha;
  final String summaryBn;
  final String summaryEn;

  String summaryFor(String languageCode) =>
      languageCode == 'en' && summaryEn.isNotEmpty ? summaryEn : summaryBn;
}

/// Who applied, as the API summarises them for the poster.
///
/// Older APIs send no summary; [JobApplicationSummary.applicant] is then null
/// and the card falls back to the short worker label.
class ApplicantSummary {
  const ApplicantSummary({
    required this.displayName,
    this.photoUrl,
    this.ratingAverage,
    this.ratingCount = 0,
    this.completedJobsCount,
    this.trustLevel,
    this.identityVerified = false,
  });

  /// Reads the summary under any of the names the API may use for it.
  static ApplicantSummary? fromApplication(Map<String, dynamic> json) {
    final raw = json['worker'] ?? json['applicant'] ?? json['workerSummary'];
    if (raw is! Map) return null;
    final value = Map<String, dynamic>.from(raw);
    final name = (value['displayName'] ?? value['name']) as Object?;
    final trust = value['trustLevel'] as Object?;
    final rating = _number(
      value['ratingAverage'] ?? value['averageRating'] ?? value['rating'],
    );
    final verifiedFlag =
        value['identityVerified'] ?? value['isVerified'] ?? value['verified'];
    return ApplicantSummary(
      displayName: name is String ? name.trim() : '',
      photoUrl:
          value['photoUrl'] is String &&
              (value['photoUrl'] as String).trim().isNotEmpty
          ? value['photoUrl'] as String
          : null,
      ratingAverage: rating != null && rating > 0 ? rating : null,
      ratingCount:
          _number(value['ratingCount'] ?? value['reviewCount'])?.toInt() ?? 0,
      completedJobsCount: _number(
        value['completedJobsCount'] ?? value['completedJobs'],
      )?.toInt(),
      trustLevel: trust is String ? trust : null,
      // An explicit flag from the API wins; older shapes only had the level.
      identityVerified: verifiedFlag is bool
          ? verifiedFlag
          : _identityTrust.contains(trust),
    );
  }

  static const _identityTrust = {'IDENTITY', 'VERIFIED', 'SKILL', 'BUSINESS'};

  static double? _number(Object? value) => switch (value) {
    final num number => number.toDouble(),
    final String text => double.tryParse(text),
    _ => null,
  };

  final int? completedJobsCount;
  final String displayName;
  final bool identityVerified;
  final String? photoUrl;
  final double? ratingAverage;
  final int ratingCount;
  final String? trustLevel;
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
    this.applicant,
  });

  factory JobApplicationSummary.fromJson(Map<String, dynamic> json) =>
      JobApplicationSummary(
        id: json['id'] as String,
        status: json['status'] as String? ?? '',
        workerUserId: json['workerUserId'] as String? ?? '',
        message: json['message'] as String?,
        proposedPricePoisha: Money.tryParse(json['proposedPricePoisha']),
        startsAt: DateTime.tryParse(json['proposedStartsAt'] as String? ?? ''),
        endsAt: DateTime.tryParse(json['proposedEndsAt'] as String? ?? ''),
        applicant: ApplicantSummary.fromApplication(json),
      );

  final ApplicantSummary? applicant;
  final DateTime? endsAt;
  final String id;
  final String? message;
  final Money? proposedPricePoisha;
  final DateTime? startsAt;
  final String status;
  final String workerUserId;

  /// The short label used before the API sent a name.
  String get fallbackLabel =>
      workerUserId.length > 8 ? workerUserId.substring(0, 8) : workerUserId;
}

/// A review with the four sub-scores the poster or worker actually chose.
class ReviewInput {
  const ReviewInput({
    required this.rating,
    required this.punctuality,
    required this.quality,
    required this.communication,
    required this.reliability,
    this.comment = '',
  });

  final int communication;
  final String comment;
  final int punctuality;
  final int quality;
  final int rating;
  final int reliability;

  Map<String, dynamic> toJson() => {
    'rating': rating,
    'punctuality': punctuality,
    'quality': quality,
    'communication': communication,
    'reliability': reliability,
    if (comment.trim().isNotEmpty) 'comment': comment.trim(),
  };
}

class JobPoster {
  const JobPoster({
    required this.id,
    required this.displayName,
    required this.trustLevel,
    required this.badges,
  });

  factory JobPoster.fromJson(Map<String, dynamic> json) => JobPoster(
    id: json['id'] as String? ?? '',
    displayName: json['displayName'] as String? ?? '',
    trustLevel: json['trustLevel'] as String? ?? 'NONE',
    badges:
        (json['badges'] as List?)?.whereType<String>().toList(
          growable: false,
        ) ??
        const [],
  );

  final List<String> badges;
  final String displayName;
  final String id;
  final String trustLevel;
}

/// `GET /jobs/:id`: the public job plus what the viewer needs to act on it.
class JobDetail {
  const JobDetail({
    required this.job,
    required this.viewerIsPoster,
    this.poster,
    this.viewerApplicationStatus,
    this.subcategoryName,
    this.subcategoryNameEn,
  });

  factory JobDetail.fromJson(Map<String, dynamic> json) {
    final poster = json['poster'];
    final subcategory = json['subcategory'];
    return JobDetail(
      job: JobSummary.fromJson(json),
      poster: poster is Map
          ? JobPoster.fromJson(Map<String, dynamic>.from(poster))
          : null,
      viewerApplicationStatus: json['viewerApplicationStatus'] as String?,
      viewerIsPoster: json['viewerIsPoster'] == true,
      subcategoryName: subcategory is Map
          ? subcategory['name_bn'] as String?
          : null,
      subcategoryNameEn: subcategory is Map
          ? subcategory['name_en'] as String?
          : null,
    );
  }

  final JobSummary job;
  final JobPoster? poster;
  final String? subcategoryName;
  final String? subcategoryNameEn;
  final String? viewerApplicationStatus;
  final bool viewerIsPoster;

  bool get hasApplied => viewerApplicationStatus != null;

  bool get isOpen =>
      job.status == 'APPLICATIONS_OPEN' || job.status == 'PUBLISHED';

  String? subcategoryNameFor(String languageCode) =>
      languageCode == 'en' && (subcategoryNameEn?.isNotEmpty ?? false)
      ? subcategoryNameEn
      : subcategoryName;
}

class JobAlert {
  const JobAlert({
    required this.id,
    required this.labelEn,
    required this.labelBn,
    required this.createdAt,
    this.categoryId,
    this.skillId,
    this.locationId,
  });

  factory JobAlert.fromJson(Map<String, dynamic> json) => JobAlert(
    id: json['id'] as String? ?? '',
    categoryId: json['categoryId'] as String?,
    skillId: json['skillId'] as String?,
    locationId: json['locationId'] as String?,
    labelEn: json['labelEn'] as String? ?? '',
    labelBn: json['labelBn'] as String? ?? '',
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
  );

  final String? categoryId;
  final DateTime createdAt;
  final String id;
  final String labelBn;
  final String labelEn;
  final String? locationId;
  final String? skillId;

  String labelFor(String languageCode) => languageCode == 'en'
      ? (labelEn.isNotEmpty ? labelEn : labelBn)
      : (labelBn.isNotEmpty ? labelBn : labelEn);
}

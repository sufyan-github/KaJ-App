class VerificationRequest {
  const VerificationRequest({
    required this.id,
    required this.kind,
    required this.status,
    required this.createdAt,
    this.rejectionReason,
  });

  factory VerificationRequest.fromJson(Map<String, dynamic> json) =>
      VerificationRequest(
        id: json['id'] as String,
        kind: json['kind'] as String? ?? '',
        status: json['status'] as String? ?? '',
        createdAt:
            DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
        rejectionReason: json['rejectionReason'] as String?,
      );

  final String id;
  final String kind;
  final String status;
  final DateTime createdAt;
  final String? rejectionReason;
}

class ApplicationEligibility {
  const ApplicationEligibility({
    required this.canApply,
    required this.identityStatus,
    required this.phoneVerified,
    required this.identityInformationVerified,
    required this.nidVerified,
    required this.selfieVerified,
  });

  factory ApplicationEligibility.fromJson(Map<String, dynamic> json) {
    final requirements = Map<String, dynamic>.from(
      json['requirements'] as Map? ?? const {},
    );
    bool verified(String key) {
      final item = requirements[key];
      return item is Map && item['verified'] == true;
    }

    return ApplicationEligibility(
      canApply: json['canApply'] == true,
      identityStatus: json['identityStatus'] as String? ?? 'NOT_SUBMITTED',
      phoneVerified: verified('phone'),
      identityInformationVerified: verified('identityInformation'),
      nidVerified: verified('nid'),
      selfieVerified: verified('selfie'),
    );
  }

  final bool canApply;
  final String identityStatus;
  final bool phoneVerified;
  final bool identityInformationVerified;
  final bool nidVerified;
  final bool selfieVerified;
}

class AttendanceState {
  const AttendanceState({
    required this.geofenceRadiusM,
    required this.maxAccuracyM,
    required this.consentVersion,
    this.checkinAt,
    this.checkoutAt,
    this.checkinDistanceM,
    this.checkoutDistanceM,
    this.minutesWorked,
    this.verifiedBy,
    this.overrideReason,
  });

  factory AttendanceState.fromJson(Map<String, dynamic> json) {
    final settings = Map<String, dynamic>.from(
      json['settings'] as Map? ?? const {},
    );
    return AttendanceState(
      checkinAt: DateTime.tryParse(json['checkinAt'] as String? ?? ''),
      checkoutAt: DateTime.tryParse(json['checkoutAt'] as String? ?? ''),
      checkinDistanceM: (json['checkinDistanceM'] as num?)?.toInt(),
      checkoutDistanceM: (json['checkoutDistanceM'] as num?)?.toInt(),
      minutesWorked: (json['minutesWorked'] as num?)?.toInt(),
      verifiedBy: json['verifiedBy'] as String?,
      overrideReason: json['overrideReason'] as String?,
      geofenceRadiusM: (settings['geofenceRadiusM'] as num?)?.toInt() ?? 300,
      maxAccuracyM: (settings['maxAccuracyM'] as num?)?.toDouble() ?? 100,
      consentVersion:
          settings['consentVersion'] as String? ?? 'location-checkin-v1',
    );
  }

  final DateTime? checkinAt;
  final DateTime? checkoutAt;
  final int? checkinDistanceM;
  final int? checkoutDistanceM;
  final int? minutesWorked;
  final String? verifiedBy;
  final String? overrideReason;
  final int geofenceRadiusM;
  final double maxAccuracyM;
  final String consentVersion;
}

class DisputeSummary {
  const DisputeSummary({
    required this.id,
    required this.status,
    required this.reasonCode,
    required this.description,
    required this.evidenceDueAt,
    required this.resolutionDueAt,
    required this.createdAt,
    this.jobTitle,
    this.decision,
    this.appealStatus,
    this.resolvedAt,
    this.evidence = const [],
  });

  factory DisputeSummary.fromJson(Map<String, dynamic> json) => DisputeSummary(
    id: json['id'] as String,
    status: json['status'] as String? ?? '',
    reasonCode: json['reasonCode'] as String? ?? '',
    description: json['description'] as String? ?? '',
    jobTitle: json['jobTitle'] as String?,
    decision: json['decision'] as String?,
    appealStatus: json['appealStatus'] as String?,
    evidenceDueAt:
        DateTime.tryParse(json['evidenceDueAt'] as String? ?? '') ??
        DateTime.now(),
    resolutionDueAt:
        DateTime.tryParse(json['resolutionDueAt'] as String? ?? '') ??
        DateTime.now(),
    resolvedAt: DateTime.tryParse(json['resolvedAt'] as String? ?? ''),
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    evidence:
        (json['evidence'] as List?)
            ?.whereType<Map>()
            .map((item) => DisputeEvidence.fromJson(Map.from(item)))
            .toList(growable: false) ??
        const [],
  );

  final String id;
  final String status;
  final String reasonCode;
  final String description;
  final String? jobTitle;
  final String? decision;
  final String? appealStatus;
  final DateTime evidenceDueAt;
  final DateTime resolutionDueAt;
  final DateTime? resolvedAt;
  final DateTime createdAt;
  final List<DisputeEvidence> evidence;
}

class DisputeEvidence {
  const DisputeEvidence({
    required this.id,
    required this.kind,
    required this.createdAt,
    required this.hasAttachment,
    this.text,
  });

  factory DisputeEvidence.fromJson(Map<String, dynamic> json) =>
      DisputeEvidence(
        id: json['id'] as String,
        kind: json['kind'] as String? ?? '',
        text: json['text'] as String?,
        hasAttachment: json['hasAttachment'] == true,
        createdAt:
            DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
      );
  final String id;
  final String kind;
  final String? text;
  final bool hasAttachment;
  final DateTime createdAt;
}

class BlockedUser {
  const BlockedUser({
    required this.userId,
    required this.displayName,
    required this.blockedAt,
  });
  factory BlockedUser.fromJson(Map<String, dynamic> json) => BlockedUser(
    userId: json['userId'] as String,
    displayName: json['displayName'] as String? ?? 'KAAJ ব্যবহারকারী',
    blockedAt:
        DateTime.tryParse(json['blockedAt'] as String? ?? '') ?? DateTime.now(),
  );
  final String userId;
  final String displayName;
  final DateTime blockedAt;
}

class PortfolioItem {
  const PortfolioItem({
    required this.id,
    required this.imageUrl,
    required this.categoryId,
    required this.categoryName,
    required this.sortOrder,
    required this.createdAt,
    this.caption,
  });

  factory PortfolioItem.fromJson(Map<String, dynamic> json) {
    final category = Map<String, dynamic>.from(
      json['category'] as Map? ?? const {},
    );
    return PortfolioItem(
      id: json['id'] as String,
      imageUrl: json['imageUrl'] as String? ?? '',
      caption: json['caption'] as String?,
      categoryId: category['id'] as String? ?? '',
      categoryName: category['nameBn'] as String? ?? 'কাজ',
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
    );
  }

  final String id;
  final String imageUrl;
  final String? caption;
  final String categoryId;
  final String categoryName;
  final int sortOrder;
  final DateTime createdAt;
}

class MobileOperatorOption {
  const MobileOperatorOption({
    required this.code,
    required this.nameEn,
    required this.nameBn,
  });

  factory MobileOperatorOption.fromJson(Map<String, dynamic> json) =>
      MobileOperatorOption(
        code: json['code'] as String? ?? '',
        nameEn: json['nameEn'] as String? ?? '',
        nameBn: json['nameBn'] as String? ?? '',
      );

  final String code;
  final String nameEn;
  final String nameBn;

  String nameFor(String languageCode) => languageCode == 'en' ? nameEn : nameBn;
}

class OperatorIdentity {
  const OperatorIdentity({
    required this.status,
    this.operator,
    this.verifiedAt,
  });

  factory OperatorIdentity.fromJson(Map<String, dynamic> json) =>
      OperatorIdentity(
        status: json['status'] as String? ?? 'PENDING',
        operator: json['operator'] is Map
            ? MobileOperatorOption.fromJson(
                Map<String, dynamic>.from(json['operator'] as Map),
              )
            : null,
        verifiedAt: DateTime.tryParse(json['verifiedAt'] as String? ?? ''),
      );

  final MobileOperatorOption? operator;
  final String status;
  final DateTime? verifiedAt;
}

class SubscriptionPlan {
  const SubscriptionPlan({
    required this.id,
    required this.code,
    required this.nameEn,
    required this.nameBn,
    required this.pricePoisha,
    required this.currency,
    required this.durationDays,
    required this.featureKeys,
    this.descriptionEn,
    this.descriptionBn,
  });

  factory SubscriptionPlan.fromJson(Map<String, dynamic> json) =>
      SubscriptionPlan(
        id: json['id'] as String? ?? '',
        code: json['code'] as String? ?? '',
        nameEn: json['nameEn'] as String? ?? '',
        nameBn: json['nameBn'] as String? ?? '',
        descriptionEn: json['descriptionEn'] as String?,
        descriptionBn: json['descriptionBn'] as String?,
        pricePoisha: json['pricePoisha']?.toString() ?? '0',
        currency: json['currency'] as String? ?? 'BDT',
        durationDays: (json['durationDays'] as num?)?.toInt() ?? 0,
        featureKeys:
            (json['featureKeys'] as List?)?.whereType<String>().toList(
              growable: false,
            ) ??
            const [],
      );

  final String code;
  final String currency;
  final String? descriptionBn;
  final String? descriptionEn;
  final int durationDays;
  final List<String> featureKeys;
  final String id;
  final String nameBn;
  final String nameEn;
  final String pricePoisha;

  String nameFor(String languageCode) => languageCode == 'en' ? nameEn : nameBn;

  String? descriptionFor(String languageCode) => languageCode == 'en'
      ? descriptionEn ?? descriptionBn
      : descriptionBn ?? descriptionEn;
}

class SubscriptionRecord {
  const SubscriptionRecord({
    required this.id,
    required this.status,
    required this.plan,
    this.startsAt,
    this.expiresAt,
    this.paymentStatus,
    this.paymentMethod,
  });

  factory SubscriptionRecord.fromJson(Map<String, dynamic> json) {
    final payment = json['payment'] is Map
        ? Map<String, dynamic>.from(json['payment'] as Map)
        : null;
    return SubscriptionRecord(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? 'INACTIVE',
      plan: SubscriptionPlan.fromJson(
        Map<String, dynamic>.from(json['plan'] as Map? ?? const {}),
      ),
      startsAt: DateTime.tryParse(json['startsAt'] as String? ?? ''),
      expiresAt: DateTime.tryParse(json['expiresAt'] as String? ?? ''),
      paymentStatus: payment?['status'] as String?,
      paymentMethod: payment?['method'] as String?,
    );
  }

  final DateTime? expiresAt;
  final String id;
  final String? paymentMethod;
  final String? paymentStatus;
  final SubscriptionPlan plan;
  final DateTime? startsAt;
  final String status;
}

class SubscriptionOverview {
  const SubscriptionOverview({
    required this.accessActive,
    required this.gateEnabled,
    required this.onlinePaymentsEnabled,
    required this.workerWithdrawalsEnabled,
    required this.plans,
    required this.operators,
    this.operatorIdentity,
    this.current,
  });

  factory SubscriptionOverview.fromJson(Map<String, dynamic> json) =>
      SubscriptionOverview(
        accessActive: json['accessActive'] == true,
        gateEnabled: json['gateEnabled'] == true,
        onlinePaymentsEnabled: json['onlinePaymentsEnabled'] == true,
        workerWithdrawalsEnabled: json['workerWithdrawalsEnabled'] == true,
        operatorIdentity: json['operator'] is Map
            ? OperatorIdentity.fromJson(
                Map<String, dynamic>.from(json['operator'] as Map),
              )
            : null,
        current: json['current'] is Map
            ? SubscriptionRecord.fromJson(
                Map<String, dynamic>.from(json['current'] as Map),
              )
            : null,
        plans:
            (json['plans'] as List?)
                ?.whereType<Map>()
                .map(
                  (item) => SubscriptionPlan.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList(growable: false) ??
            const [],
        operators:
            (json['operators'] as List?)
                ?.whereType<Map>()
                .map(
                  (item) => MobileOperatorOption.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList(growable: false) ??
            const [],
      );

  final bool accessActive;
  final SubscriptionRecord? current;
  final bool gateEnabled;
  final bool onlinePaymentsEnabled;
  final OperatorIdentity? operatorIdentity;
  final List<MobileOperatorOption> operators;
  final List<SubscriptionPlan> plans;
  final bool workerWithdrawalsEnabled;
}

class JobPaymentRecord {
  const JobPaymentRecord({
    required this.id,
    required this.assignmentId,
    required this.jobTitle,
    required this.role,
    required this.agreedPoisha,
    required this.currency,
    required this.method,
    required this.status,
    required this.createdAt,
    this.cashRecordedAt,
    this.disputedAt,
  });

  factory JobPaymentRecord.fromJson(
    Map<String, dynamic> json,
  ) => JobPaymentRecord(
    id: json['id'] as String? ?? '',
    assignmentId: json['assignmentId'] as String? ?? '',
    jobTitle: json['jobTitle'] as String? ?? 'কাজ',
    role: json['role'] as String? ?? '',
    agreedPoisha: json['agreedPoisha']?.toString() ?? '0',
    currency: json['currency'] as String? ?? 'BDT',
    method: json['method'] as String? ?? 'CASH_ON_COMPLETION',
    status: json['status'] as String? ?? 'PENDING',
    cashRecordedAt: DateTime.tryParse(json['cashRecordedAt'] as String? ?? ''),
    disputedAt: DateTime.tryParse(json['disputedAt'] as String? ?? ''),
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
  );

  final String agreedPoisha;
  final String assignmentId;
  final DateTime? cashRecordedAt;
  final DateTime createdAt;
  final String currency;
  final DateTime? disputedAt;
  final String id;
  final String jobTitle;
  final String method;
  final String role;
  final String status;
}

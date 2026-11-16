import '../../../core/formatting/money.dart';

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
        pricePoisha: Money.parseOrZero(json['pricePoisha']),
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
  final Money pricePoisha;

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

/// How to stop carrier billing by SMS when the in-app cancel cannot reach the
/// operator. Values come from the API; the defaults match the BDApps listing.
class CancelInstructions {
  const CancelInstructions({
    this.smsKeyword = defaultSmsKeyword,
    this.shortCode = defaultShortCode,
    this.inApp = true,
  });

  factory CancelInstructions.fromJson(Map<String, Object?> json) =>
      CancelInstructions(
        smsKeyword: _keyword(json['smsKeyword']),
        shortCode: _shortCode(json['shortCode']),
        inApp: json['inApp'] != false,
      );

  /// Reads the first usable entry of an error `details` list.
  static CancelInstructions? fromDetails(List<Map<String, Object?>> details) {
    for (final item in details) {
      if (item['smsKeyword'] is String || item['shortCode'] is String) {
        return CancelInstructions.fromJson(item);
      }
    }
    return null;
  }

  static const defaultSmsKeyword = 'STOP kaaj';
  static const defaultShortCode = '21213';

  final bool inApp;
  final String shortCode;
  final String smsKeyword;

  /// `sms:21213?body=STOP%20kaaj` with the space percent-encoded, because
  /// some SMS apps show a literal plus sign for form-style encoding.
  Uri get smsUri =>
      Uri.parse('sms:$shortCode?body=${Uri.encodeComponent(smsKeyword)}');

  static String _keyword(Object? value) {
    final text = value is String ? value.trim() : '';
    return text.isEmpty || text.length > 40 ? defaultSmsKeyword : text;
  }

  static String _shortCode(Object? value) {
    final text = value is String ? value.trim() : '';
    return RegExp(r'^[0-9]{3,8}$').hasMatch(text) ? text : defaultShortCode;
  }
}

/// Carrier side subscription state as last seen by the backend.
enum CarrierStatus {
  registered,
  unregistered,
  chargePending;

  static CarrierStatus? parse(Object? value) => switch (value) {
    'REGISTERED' => registered,
    'UNREGISTERED' => unregistered,
    'CHARGE_PENDING' => chargePending,
    _ => null,
  };
}

class SubscriptionOverview {
  const SubscriptionOverview({
    required this.accessActive,
    required this.gateEnabled,
    required this.onlinePaymentsEnabled,
    required this.operatorStatusRefreshFailed,
    required this.workerWithdrawalsEnabled,
    required this.plans,
    required this.operators,
    this.operatorIdentity,
    this.current,
    this.carrierStatus,
    this.cancelInstructions = const CancelInstructions(),
    this.operatorPlanMissing = false,
    this.freeModules = const {},
  });

  factory SubscriptionOverview.fromJson(
    Map<String, dynamic> json,
  ) => SubscriptionOverview(
    accessActive: json['accessActive'] == true,
    freeModules: _parseFreeModules(json),
    gateEnabled: json['gateEnabled'] == true,
    onlinePaymentsEnabled: json['onlinePaymentsEnabled'] == true,
    operatorStatusRefreshFailed: json['operatorStatusRefreshFailed'] == true,
    operatorPlanMissing: json['operatorPlanMissing'] == true,
    carrierStatus: CarrierStatus.parse(json['carrierStatus']),
    cancelInstructions: json['cancelInstructions'] is Map
        ? CancelInstructions.fromJson(
            Map<String, Object?>.from(json['cancelInstructions'] as Map),
          )
        : const CancelInstructions(),
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
              (item) =>
                  SubscriptionPlan.fromJson(Map<String, dynamic>.from(item)),
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

  /// See [_parseFreeModules]. LEARN here means courses and learning
  /// opportunities stay open without a subscription.
  final Set<String> freeModules;
  final CancelInstructions cancelInstructions;
  final CarrierStatus? carrierStatus;
  final SubscriptionRecord? current;
  final bool gateEnabled;
  final bool onlinePaymentsEnabled;
  final bool operatorPlanMissing;
  final bool operatorStatusRefreshFailed;
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
    agreedPoisha: Money.parseOrZero(json['agreedPoisha']),
    currency: json['currency'] as String? ?? 'BDT',
    method: json['method'] as String? ?? 'CASH_ON_COMPLETION',
    status: json['status'] as String? ?? 'PENDING',
    cashRecordedAt: DateTime.tryParse(json['cashRecordedAt'] as String? ?? ''),
    disputedAt: DateTime.tryParse(json['disputedAt'] as String? ?? ''),
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
  );

  final Money agreedPoisha;
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

/// Modules that never need a subscription, from `freeModules: [..]` or
/// `moduleAccess: {MODULE: true}`. Empty on servers that send neither,
/// which keeps the whole-app paywall as before.
Set<String> _parseFreeModules(Map<String, dynamic> json) {
  final list = json['freeModules'];
  if (list is List) {
    return list.whereType<String>().map((m) => m.toUpperCase()).toSet();
  }
  final access = json['moduleAccess'];
  if (access is Map) {
    return {
      for (final entry in access.entries)
        if (entry.value == true && entry.key is String)
          (entry.key as String).toUpperCase(),
    };
  }
  return const {};
}

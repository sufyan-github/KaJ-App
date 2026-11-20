/// KAAJ AI (P4): status, consent and the three AI features. Every reader
/// tolerates missing fields; the server may add more.
library;

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};

List<Map<String, dynamic>> _list(Object? value) => value is List
    ? value.whereType<Map>().map(Map<String, dynamic>.from).toList()
    : const [];

String? _text(Object? value) =>
    value is String && value.trim().isNotEmpty ? value : null;

int? _int(Object? value) => switch (value) {
  final num number => number.toInt(),
  final String text => int.tryParse(text),
  _ => null,
};

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toLocal() : null;

abstract final class AiFeatures {
  static const ideaAnalysis = 'IDEA_ANALYSIS';
  static const suggestions = 'OPPORTUNITY_SUGGESTIONS';
  static const growthTips = 'BUSINESS_GROWTH_TIPS';
}

class AiQuota {
  const AiQuota({
    this.dailyLimit,
    this.remainingToday,
    this.requiresSubscription = false,
    this.subscriptionActive,
  });

  factory AiQuota.fromJson(Map<String, dynamic> json) => AiQuota(
    dailyLimit: _int(json['dailyLimit']),
    remainingToday: _int(json['remainingToday']),
    requiresSubscription: json['requiresSubscription'] == true,
    subscriptionActive: json['subscriptionActive'] as bool?,
  );

  final int? dailyLimit;

  /// Null when the server could not read the quota store.
  final int? remainingToday;
  final bool requiresSubscription;
  final bool? subscriptionActive;

  bool get needsSubscription =>
      requiresSubscription && subscriptionActive == false;
}

class AiStatus {
  const AiStatus({
    required this.enabled,
    this.consentRequired = true,
    this.currentVersion = 1,
    this.consentAccepted = false,
    this.acceptedAt,
    this.quotaResetsAt,
    this.features = const {},
  });

  factory AiStatus.fromJson(Map<String, dynamic> json) {
    final consent = _map(json['consent']);
    final features = _map(json['features']);
    return AiStatus(
      enabled: json['enabled'] == true,
      consentRequired: consent['required'] != false,
      currentVersion: _int(consent['currentVersion']) ?? 1,
      consentAccepted: consent['accepted'] == true,
      acceptedAt: _date(consent['acceptedAt']),
      quotaResetsAt: _date(json['quotaResetsAt']),
      features: {
        for (final entry in features.entries)
          entry.key: AiQuota.fromJson(_map(entry.value)),
      },
    );
  }

  /// What an older server (no `/ai/status`) or a failed read means: no AI.
  static const off = AiStatus(enabled: false);

  final bool enabled;
  final bool consentRequired;
  final int currentVersion;
  final bool consentAccepted;
  final DateTime? acceptedAt;
  final DateTime? quotaResetsAt;
  final Map<String, AiQuota> features;

  bool get needsConsent => consentRequired && !consentAccepted;

  AiQuota quota(String feature) => features[feature] ?? const AiQuota();
}

class AiRated {
  const AiRated({this.rating, this.explanation});

  factory AiRated.fromJson(Object? value) {
    final json = _map(value);
    return AiRated(
      rating: _text(json['rating']),
      explanation: _text(json['explanation']),
    );
  }

  final String? rating;
  final String? explanation;
}

class AiCostLine {
  const AiCostLine(this.item, this.minBdt, this.maxBdt);
  final String item;
  final int? minBdt;
  final int? maxBdt;
}

class AiRisk {
  const AiRisk(this.risk, this.severity, this.mitigation);
  final String risk;
  final String? severity;
  final String? mitigation;
}

class AiPointer {
  const AiPointer(this.label, this.why);
  final String label;
  final String? why;
}

class IdeaAnalysis {
  const IdeaAnalysis({
    this.analyzedAt,
    this.summary,
    this.feasibility = const AiRated(),
    this.marketFit = const AiRated(),
    this.targetCustomers = const [],
    this.costs = const [],
    this.totalMinBdt,
    this.totalMaxBdt,
    this.costAssumptions,
    this.risks = const [],
    this.nextSteps = const [],
    this.experts = const [],
    this.learning = const [],
    this.partners = const [],
  });

  factory IdeaAnalysis.fromJson(Map<String, dynamic> json) {
    final analysis = _map(json['analysis']);
    final market = _map(analysis['localMarketFit']);
    final costs = _map(analysis['startupCostsBdt']);
    final links = _map(analysis['kaajConnections']);
    List<AiPointer> pointers(String key, String label) => [
      for (final item in _list(links[key]))
        if (_text(item[label]) case final text?)
          AiPointer(text, _text(item['why'])),
    ];
    return IdeaAnalysis(
      analyzedAt: _date(json['analyzedAt']),
      summary: _text(analysis['summary']),
      feasibility: AiRated.fromJson(analysis['feasibility']),
      marketFit: AiRated.fromJson(market),
      targetCustomers: [
        for (final item in (market['targetCustomers'] as List? ?? const []))
          ?_text(item),
      ],
      costs: [
        for (final item in _list(costs['items']))
          if (_text(item['item']) case final text?)
            AiCostLine(text, _int(item['minBdt']), _int(item['maxBdt'])),
      ],
      totalMinBdt: _int(costs['totalMinBdt']),
      totalMaxBdt: _int(costs['totalMaxBdt']),
      costAssumptions: _text(costs['assumptions']),
      risks: [
        for (final item in _list(analysis['risks']))
          if (_text(item['risk']) case final text?)
            AiRisk(text, _text(item['severity']), _text(item['mitigation'])),
      ],
      nextSteps: [
        for (final item in _list(analysis['nextSteps']))
          if (_text(item['step']) case final text?)
            AiPointer(text, _text(item['timeframe'])),
      ],
      experts: pointers('experts', 'field'),
      learning: pointers('learning', 'topic'),
      partners: pointers('partners', 'partnerType'),
    );
  }

  final DateTime? analyzedAt;
  final String? summary;
  final AiRated feasibility;
  final AiRated marketFit;
  final List<String> targetCustomers;
  final List<AiCostLine> costs;
  final int? totalMinBdt;
  final int? totalMaxBdt;
  final String? costAssumptions;
  final List<AiRisk> risks;

  /// Step with its timeframe in [AiPointer.why].
  final List<AiPointer> nextSteps;
  final List<AiPointer> experts;
  final List<AiPointer> learning;
  final List<AiPointer> partners;

  /// `GET` answers all-null fields when there is no stored analysis.
  bool get isEmpty => analyzedAt == null && summary == null;
}

class AiSuggestion {
  const AiSuggestion({
    required this.type,
    required this.id,
    required this.title,
    this.areaEn,
    this.areaBn,
    this.score,
    this.reason,
  });

  final String type;
  final String id;
  final String title;
  final String? areaEn;
  final String? areaBn;
  final int? score;
  final String? reason;
}

class AiSuggestions {
  const AiSuggestions({
    required this.source,
    this.summary,
    this.items = const [],
  });

  factory AiSuggestions.fromJson(Map<String, dynamic> json) => AiSuggestions(
    source: _text(json['source']) ?? 'NONE',
    summary: _text(json['summary']),
    items: [
      for (final item in _list(json['items']))
        if (_text(item['id']) case final id?)
          AiSuggestion(
            type: _text(item['type']) ?? '',
            id: id,
            title: _text(item['title']) ?? '',
            areaEn: _text(_map(item['area'])['nameEn']),
            areaBn: _text(_map(item['area'])['nameBn']),
            score: _int(item['score']),
            reason: _text(item['reason']),
          ),
    ],
  );

  final String source;
  final String? summary;
  final List<AiSuggestion> items;
}

class AiGrowthTip {
  const AiGrowthTip({
    required this.title,
    this.detail,
    this.area,
    this.effort,
    this.costMin,
    this.costMax,
    this.action,
  });

  final String title;
  final String? detail;
  final String? area;
  final String? effort;
  final int? costMin;
  final int? costMax;
  final String? action;
}

class AiGrowthTips {
  const AiGrowthTips({
    required this.source,
    this.summary,
    this.tips = const [],
  });

  factory AiGrowthTips.fromJson(Map<String, dynamic> json) => AiGrowthTips(
    source: _text(json['source']) ?? 'FALLBACK',
    summary: _text(json['summary']),
    tips: [
      for (final tip in _list(json['tips']))
        if (_text(tip['title']) case final title?)
          AiGrowthTip(
            title: title,
            detail: _text(tip['detail']),
            area: _text(tip['area']),
            effort: _text(tip['effort']),
            costMin: _int(_map(tip['costBdt'])['min']),
            costMax: _int(_map(tip['costBdt'])['max']),
            action: _text(tip['kaajAction']),
          ),
    ],
  );

  final String source;
  final String? summary;
  final List<AiGrowthTip> tips;
}

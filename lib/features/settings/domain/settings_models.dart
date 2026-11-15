class NotificationPreference {
  const NotificationPreference({
    required this.channel,
    required this.type,
    required this.isEnabled,
    this.quietHoursStart,
    this.quietHoursEnd,
  });

  factory NotificationPreference.fromJson(Map<String, dynamic> json) =>
      NotificationPreference(
        channel: json['channel'] as String? ?? 'IN_APP',
        type: json['type'] as String? ?? '',
        isEnabled: json['isEnabled'] as bool? ?? true,
        quietHoursStart: json['quietHoursStart'] as String?,
        quietHoursEnd: json['quietHoursEnd'] as String?,
      );

  final String channel;
  final String type;
  final bool isEnabled;
  final String? quietHoursStart;
  final String? quietHoursEnd;
}

class AccountSummary {
  const AccountSummary({
    required this.id,
    required this.phone,
    required this.activeRole,
    required this.roles,
  });

  factory AccountSummary.fromJson(Map<String, dynamic> json) => AccountSummary(
    id: json['id'] as String? ?? '',
    phone: json['phoneE164'] as String? ?? '',
    activeRole: json['activeRole'] as String? ?? 'CUSTOMER',
    roles:
        (json['roles'] as List?)?.whereType<String>().toList(growable: false) ??
        const [],
  );

  final String id;
  final String phone;
  final String activeRole;
  final List<String> roles;

  String get maskedPhone {
    if (phone.length < 7) return phone;
    return '${phone.substring(0, 6)}•••${phone.substring(phone.length - 3)}';
  }
}

/// Who sees the profile photo.
enum PhotoVisibility {
  everyone('EVERYONE'),
  afterHire('AFTER_HIRE'),
  nobody('NOBODY');

  const PhotoVisibility(this.wire);
  final String wire;

  static PhotoVisibility parse(Object? value) => PhotoVisibility.values
      .firstWhere((item) => item.wire == value, orElse: () => everyone);
}

/// Who may start a conversation.
enum MessagePermission {
  anyone('ANYONE'),
  engagedOnly('ENGAGED_ONLY');

  const MessagePermission(this.wire);
  final String wire;

  static MessagePermission parse(Object? value) => MessagePermission.values
      .firstWhere((item) => item.wire == value, orElse: () => anyone);
}

/// The person's own privacy choices, as `/profiles/me/privacy` stores them.
class PrivacySettings {
  const PrivacySettings({
    this.photoVisibility = PhotoVisibility.everyone,
    this.showFullName = true,
    this.hidePreciseArea = false,
    this.allowMessagesFrom = MessagePermission.anyone,
    this.discoverable = true,
  });

  factory PrivacySettings.fromJson(Map<String, dynamic> json) =>
      PrivacySettings(
        photoVisibility: PhotoVisibility.parse(json['photoVisibility']),
        showFullName: json['showFullName'] != false,
        hidePreciseArea: json['hidePreciseArea'] == true,
        allowMessagesFrom: MessagePermission.parse(json['allowMessagesFrom']),
        discoverable: json['discoverable'] != false,
      );

  final MessagePermission allowMessagesFrom;
  final bool discoverable;
  final bool hidePreciseArea;
  final PhotoVisibility photoVisibility;
  final bool showFullName;

  PrivacySettings copyWith({
    PhotoVisibility? photoVisibility,
    bool? showFullName,
    bool? hidePreciseArea,
    MessagePermission? allowMessagesFrom,
    bool? discoverable,
  }) => PrivacySettings(
    photoVisibility: photoVisibility ?? this.photoVisibility,
    showFullName: showFullName ?? this.showFullName,
    hidePreciseArea: hidePreciseArea ?? this.hidePreciseArea,
    allowMessagesFrom: allowMessagesFrom ?? this.allowMessagesFrom,
    discoverable: discoverable ?? this.discoverable,
  );
}

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

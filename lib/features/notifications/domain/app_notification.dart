class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    required this.isRead,
    this.route,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final payload = json['payload'];
    return AppNotification(
      id: json['id'] as String,
      type: json['type'] as String? ?? '',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      isRead: json['readAt'] != null,
      route: payload is Map ? payload['route'] as String? : null,
    );
  }

  final String body;
  final DateTime createdAt;
  final String id;
  final bool isRead;
  final String? route;
  final String title;
  final String type;
}

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../data/notifications_repository.dart';
import '../../domain/app_notification.dart';

final notificationsRepositoryProvider = Provider<NotificationsRepository>(
  (ref) => NotificationsRepository(ref.watch(dioProvider)),
);

final notificationsProvider = FutureProvider<NotificationInbox>(
  (ref) => ref.watch(notificationsRepositoryProvider).getNotifications(),
);

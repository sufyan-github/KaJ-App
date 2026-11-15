import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/session/user_session.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../data/settings_repository.dart';
import '../domain/settings_models.dart';

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  ref.watch(sessionEpochProvider);
  return SettingsRepository(ref.watch(dioProvider));
});

final notificationPreferencesProvider =
    FutureProvider<List<NotificationPreference>>(
      (ref) => ref.watch(settingsRepositoryProvider).notificationPreferences(),
    );

final accountSummaryProvider = FutureProvider<AccountSummary>(
  (ref) => ref.watch(settingsRepositoryProvider).accountSummary(),
);

/// Null when the server has no privacy controls yet.
final privacySettingsProvider = FutureProvider<PrivacySettings?>(
  (ref) => ref.watch(settingsRepositoryProvider).privacy(),
);

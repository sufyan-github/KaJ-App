import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/controllers/auth_providers.dart';
import '../data/settings_repository.dart';
import '../domain/settings_models.dart';

final settingsRepositoryProvider = Provider<SettingsRepository>(
  (ref) => SettingsRepository(ref.watch(dioProvider)),
);

final notificationPreferencesProvider =
    FutureProvider<List<NotificationPreference>>(
      (ref) => ref.watch(settingsRepositoryProvider).notificationPreferences(),
    );

final accountSummaryProvider = FutureProvider<AccountSummary>(
  (ref) => ref.watch(settingsRepositoryProvider).accountSummary(),
);

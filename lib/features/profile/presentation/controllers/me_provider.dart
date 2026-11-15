import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../onboarding/domain/onboarding_state.dart';
import '../../../onboarding/presentation/controllers/onboarding_controller.dart';
import '../../../settings/domain/settings_models.dart';
import '../../../settings/presentation/settings_providers.dart';
import '../../domain/me.dart';
import '../../domain/my_profile.dart';
import 'my_profile_provider.dart';

/// The signed-in person from the server (`/auth/session` + `/profiles/me`).
///
/// Home, the job feed and detail, settings, job posting and booking read the
/// role and area from here, never from the onboarding draft on the phone.
/// Invalidate [myProfileProvider] or [accountSummaryProvider] after a change
/// and this follows.
final meProvider = FutureProvider<Me>((ref) async {
  final results = await Future.wait<Object>([
    ref.watch(accountSummaryProvider.future),
    ref.watch(myProfileProvider.future),
  ]);
  return Me.from(results[0] as AccountSummary, results[1] as MyProfile);
});

/// The active home mode, or null while the server has not answered yet.
/// Keeps the last known value while a refresh is in flight.
final meRoleProvider = Provider<KaajRole?>(
  (ref) => ref.watch(meProvider).valueOrNull?.role,
);

/// Switches the server's active role and refreshes everything derived from it.
class ActiveRoleSwitcher {
  const ActiveRoleSwitcher(this._activate, this._onChanged);

  final Future<void> Function(KaajRole role) _activate;
  final void Function() _onChanged;

  Future<void> switchTo(KaajRole role) async {
    await _activate(role);
    _onChanged();
  }
}

final activeRoleSwitcherProvider = Provider<ActiveRoleSwitcher>((ref) {
  final repository = ref.watch(onboardingRepositoryProvider);
  return ActiveRoleSwitcher(repository.activateRole, () {
    ref
      ..invalidate(accountSummaryProvider)
      ..invalidate(myProfileProvider);
  });
});

/// Call after anything that changes the person's profile, role or area.
void refreshMe(WidgetRef ref) {
  ref
    ..invalidate(accountSummaryProvider)
    ..invalidate(myProfileProvider);
}

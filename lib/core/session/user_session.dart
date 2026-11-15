import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';

/// Bumped every time a signed-in session ends (sign-out, sign-out
/// everywhere, or the server revoking the session).
///
/// Every repository that serves one person's data watches this, so the
/// cached feeds, profile and inbox of the previous account are rebuilt
/// instead of being shown to whoever signs in next on the same phone.
final sessionEpochProvider = StateProvider<int>((ref) => 0);

/// Removes everything stored on the phone for the signed-in person.
///
/// Language and the shared catalog cache are not per-person and stay, so the
/// next sign-in is still fast and in the right language.
class UserDataCleaner {
  const UserDataCleaner(this.boxNames);

  /// Hive boxes that hold only per-person data.
  final List<String> boxNames;

  Future<void> clear() async {
    for (final name in boxNames) {
      if (!Hive.isBoxOpen(name)) continue;
      await Hive.box<dynamic>(name).clear();
    }
  }
}

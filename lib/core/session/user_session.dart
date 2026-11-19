import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
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
  const UserDataCleaner(this.boxNames, {this.clearImages = clearImageCaches});

  /// Hive boxes that hold only per-person data.
  final List<String> boxNames;

  /// Empties the downloaded images (chat photos, portfolio, profile photos).
  final Future<void> Function() clearImages;

  Future<void> clear() async {
    for (final name in boxNames) {
      if (!Hive.isBoxOpen(name)) continue;
      await Hive.box<dynamic>(name).clear();
    }
    try {
      await clearImages();
    } on Object {
      // The next person still gets fresh providers; files expire on their own.
    }
  }
}

/// Removes images kept on disk and in memory by `KNetworkImage`, so the
/// next person on a shared phone cannot find the previous one's chat photos.
Future<void> clearImageCaches() async {
  PaintingBinding.instance.imageCache
    ..clear()
    ..clearLiveImages();
  // Widget tests have no file system plugins; the disk cache is real only
  // on a device.
  if (kIsWeb || Platform.environment.containsKey('FLUTTER_TEST')) return;
  await DefaultCacheManager().emptyCache();
}

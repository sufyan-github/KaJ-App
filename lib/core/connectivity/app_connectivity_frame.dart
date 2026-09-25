import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/generated/app_localizations.dart';
import '../widgets/k_offline_banner.dart';
import 'connectivity_service.dart';

/// Hosts the app-wide offline banner.
///
/// The banner is painted *over* the app rather than stacked above it in a
/// Column. Inserting it as a sibling would resize the whole navigator every
/// time the connection flickered, shifting content under the user's thumb and
/// changing the viewport height that screens measure against.
class AppConnectivityFrame extends ConsumerWidget {
  const AppConnectivityFrame({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOnline = ref.watch(isOnlineProvider).valueOrNull ?? true;
    return Stack(
      children: [
        Positioned.fill(child: child),
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: AnimatedSlide(
            offset: isOnline ? const Offset(0, -1) : Offset.zero,
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            child: AnimatedOpacity(
              opacity: isOnline ? 0 : 1,
              duration: const Duration(milliseconds: 180),
              child: IgnorePointer(
                ignoring: isOnline,
                child: KOfflineBanner(
                  message: AppLocalizations.of(context).offlineBanner,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

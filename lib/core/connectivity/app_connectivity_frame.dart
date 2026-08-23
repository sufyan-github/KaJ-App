import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/generated/app_localizations.dart';
import '../widgets/k_offline_banner.dart';
import 'connectivity_service.dart';

class AppConnectivityFrame extends ConsumerWidget {
  const AppConnectivityFrame({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOnline = ref.watch(isOnlineProvider).valueOrNull ?? true;
    return Column(
      children: [
        if (!isOnline)
          KOfflineBanner(message: AppLocalizations.of(context).offlineBanner),
        Expanded(child: child),
      ],
    );
  }
}

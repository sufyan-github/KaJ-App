import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'k_localized_text.dart';

class KOfflineBanner extends StatelessWidget {
  const KOfflineBanner({required this.message, super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: KColors.softSecondary,
      child: SafeArea(
        bottom: false,
        child: Semantics(
          liveRegion: true,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: KSpacing.md,
              vertical: KSpacing.sm,
            ),
            child: Row(
              children: [
                const Icon(Icons.cloud_off_outlined, color: KColors.secondary),
                const SizedBox(width: KSpacing.sm),
                Expanded(
                  child: KLocalizedText(
                    message,
                    style: const TextStyle(
                      color: KColors.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

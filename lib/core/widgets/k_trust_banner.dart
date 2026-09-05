import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'k_localized_text.dart';

class KTrustBanner extends StatelessWidget {
  const KTrustBanner({
    required this.message,
    this.icon = Icons.shield_outlined,
    this.warning = false,
    super.key,
  });

  final IconData icon;
  final String message;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    final color = warning ? KColors.secondary : KColors.primary;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: KSpacing.md,
        vertical: 12,
      ),
      decoration: BoxDecoration(
        color: warning ? KColors.softSecondary : KColors.surfaceAlt,
        borderRadius: BorderRadius.circular(KRadius.md),
        border: Border.all(color: color.withValues(alpha: warning ? .25 : .18)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: KSpacing.sm),
          Expanded(
            child: KLocalizedText(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: KColors.textPrimary,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

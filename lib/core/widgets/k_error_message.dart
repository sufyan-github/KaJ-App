import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../errors/failure.dart';
import '../theme/app_theme.dart';

class KErrorMessage extends StatelessWidget {
  const KErrorMessage({required this.failure, super.key});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(KSpacing.md),
        decoration: BoxDecoration(
          color: KColors.danger.withValues(alpha: 0.08),
          border: Border.all(color: KColors.danger.withValues(alpha: 0.35)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.info_outline, color: KColors.danger),
                const SizedBox(width: KSpacing.sm),
                Expanded(child: Text(failure.message)),
              ],
            ),
            if (failure.requestId != null) ...[
              const SizedBox(height: KSpacing.sm),
              Text(
                AppLocalizations.of(
                  context,
                ).requestReference(failure.requestId!),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

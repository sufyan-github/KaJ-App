import 'package:flutter/material.dart';

import '../errors/failure.dart';
import '../theme/app_theme.dart';
import 'k_primary_button.dart';

class KErrorState extends StatelessWidget {
  const KErrorState({
    required this.failure,
    required this.retryLabel,
    required this.onRetry,
    super.key,
  });

  final Failure failure;
  final VoidCallback onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: KSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.info_outline, size: 52, color: KColors.danger),
            const SizedBox(height: KSpacing.md),
            Text(
              failure.message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            if (failure.requestId != null) ...[
              const SizedBox(height: KSpacing.sm),
              SelectableText(
                failure.requestId!,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: KColors.textSecondary),
              ),
            ],
            const SizedBox(height: KSpacing.lg),
            KPrimaryButton(label: retryLabel, onPressed: onRetry),
          ],
        ),
      ),
    );
  }
}

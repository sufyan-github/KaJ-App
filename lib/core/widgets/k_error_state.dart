import 'package:flutter/material.dart';

import '../errors/failure.dart';
import '../localization/kaaj_localizations.dart';
import '../theme/app_theme.dart';
import 'k_localized_text.dart';
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
            KLocalizedText(
              _displayMessage(context, failure),
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

String _displayMessage(BuildContext context, Failure failure) {
  if (KaajLocalizations.isEnglish(context) ||
      RegExp(r'[\u0980-\u09FF]').hasMatch(failure.message)) {
    return failure.message;
  }
  return switch (failure.kind) {
    FailureKind.network =>
      'ইন্টারনেট সংযোগ নেই। সংযোগ ঠিক করে আবার চেষ্টা করুন।',
    FailureKind.timeout => 'অনুরোধটি বেশি সময় নিচ্ছে। আবার চেষ্টা করুন।',
    FailureKind.unauthorized =>
      'আপনার সেশনের সময় শেষ হয়েছে। আবার সাইন ইন করুন।',
    FailureKind.forbidden => 'এই কাজটি করার অনুমতি আপনার নেই।',
    FailureKind.validation => 'দেওয়া তথ্য যাচাই করে আবার চেষ্টা করুন।',
    FailureKind.notFound => 'অনুরোধ করা তথ্যটি পাওয়া যায়নি।',
    FailureKind.conflict =>
      'তথ্যটি পরিবর্তিত হয়েছে। হালনাগাদ করে আবার চেষ্টা করুন।',
    FailureKind.rateLimited =>
      'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
    FailureKind.server || FailureKind.unknown =>
      'অনুরোধটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন বা সহায়তা নিন।',
  };
}

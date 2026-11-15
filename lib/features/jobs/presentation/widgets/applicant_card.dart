import 'package:flutter/material.dart';

import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../domain/job_models.dart';

/// One applicant, with what a poster needs to decide: name, rating,
/// verification, the proposed price and a way to see the full profile.
///
/// When the API sends no applicant summary yet, it shows the short worker
/// label it always showed, so nothing breaks against an older server.
class ApplicantCard extends StatelessWidget {
  const ApplicantCard({
    required this.application,
    required this.statusLabel,
    required this.onViewProfile,
    this.onAccept,
    this.accepting = false,
    super.key,
  });

  final JobApplicationSummary application;

  /// Shown instead of the accept button once the application is decided.
  final String statusLabel;
  final VoidCallback onViewProfile;

  /// Null when the application can no longer be accepted.
  final VoidCallback? onAccept;
  final bool accepting;

  @override
  Widget build(BuildContext context) {
    final applicant = application.applicant;
    final theme = Theme.of(context);
    final name = applicant?.displayName ?? '';
    final price = application.proposedPricePoisha;
    final startsAt = application.startsAt;
    final message = application.message?.trim() ?? '';
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  foregroundImage: applicant?.photoUrl == null
                      ? null
                      : NetworkImage(applicant!.photoUrl!),
                  child: const Icon(Icons.person_outline),
                ),
                const SizedBox(width: KSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (name.isNotEmpty)
                        Text(name, style: theme.textTheme.titleMedium)
                      else
                        KLocalizedText(
                          'কর্মী ${application.fallbackLabel}',
                          style: theme.textTheme.titleMedium,
                        ),
                      if (applicant != null) ...[
                        const SizedBox(height: KSpacing.xs),
                        _RatingLine(applicant: applicant),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            if (applicant?.identityVerified == true) ...[
              const SizedBox(height: KSpacing.xs),
              const Chip(
                visualDensity: VisualDensity.compact,
                avatar: Icon(Icons.verified_user, size: 16),
                label: KLocalizedText('পরিচয় যাচাই করা'),
              ),
            ],
            const SizedBox(height: KSpacing.xs),
            if (price != null)
              Text(
                '${KaajLocalizations.text(context, 'প্রস্তাবিত মূল্য')}: '
                '${KFormat.money(context, price)}',
                style: theme.textTheme.titleSmall?.copyWith(
                  color: KColors.primary,
                ),
              ),
            if (startsAt != null)
              Text(
                KFormat.dateTime(context, startsAt),
                style: theme.textTheme.bodySmall,
              ),
            const SizedBox(height: KSpacing.xs),
            if (message.isNotEmpty)
              Text(message)
            else
              const KLocalizedText(
                'কোনো বার্তা নেই',
                style: TextStyle(color: KColors.textSecondary),
              ),
            const SizedBox(height: KSpacing.sm),
            Wrap(
              spacing: KSpacing.sm,
              runSpacing: KSpacing.xs,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                OutlinedButton.icon(
                  onPressed: onViewProfile,
                  icon: const Icon(Icons.badge_outlined),
                  label: const KLocalizedText('প্রোফাইল দেখুন'),
                ),
                if (onAccept != null)
                  FilledButton(
                    onPressed: accepting ? null : onAccept,
                    child: const KLocalizedText('গ্রহণ'),
                  )
                else
                  KLocalizedText(statusLabel),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RatingLine extends StatelessWidget {
  const _RatingLine({required this.applicant});

  final ApplicantSummary applicant;

  @override
  Widget build(BuildContext context) {
    final rating = applicant.ratingAverage;
    final style = Theme.of(context).textTheme.bodySmall;
    final jobs = applicant.completedJobsCount;
    final parts = <String>[
      if (rating == null || applicant.ratingCount == 0)
        KaajLocalizations.text(context, 'এখনো রেটিং নেই')
      else
        '★ ${KFormat.count(context, num.parse(rating.toStringAsFixed(1)))} '
            '(${KFormat.count(context, applicant.ratingCount)})',
      if (jobs != null)
        '${KFormat.count(context, jobs)}'
            '${KaajLocalizations.text(context, 'টি কাজ সম্পন্ন')}',
    ];
    return Text(parts.join(' · '), style: style);
  }
}

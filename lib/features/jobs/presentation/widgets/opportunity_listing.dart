// Listing pieces shared by work and learning opportunities: the card, the
// responsive grid sizing and the retry and inline error states.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/failure_copy.dart';
import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../domain/job_models.dart';

class OpportunityCard extends StatelessWidget {
  const OpportunityCard({
    super.key,
    required this.job,
    required this.actionLabel,
    required this.onAction,
  });

  final String? actionLabel;
  final JobSummary job;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: () => context.push(AppRoutes.jobDetail(job.id)),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: KColors.primary.withValues(alpha: .1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.work_outline, color: KColors.primary),
                ),
                if (job.matchScore case final score? when score > 0)
                  Padding(
                    padding: const EdgeInsets.only(left: KSpacing.xs),
                    child: Chip(
                      visualDensity: VisualDensity.compact,
                      avatar: const Icon(Icons.auto_awesome, size: 16),
                      label: KLocalizedText('$score%'),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: KSpacing.sm),
            Text(
              job.title,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: KSpacing.xs),
            KLocalizedText(
              '${job.categoryNameFor(Localizations.localeOf(context).languageCode)} · ${job.locationNameFor(Localizations.localeOf(context).languageCode)}',
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: KSpacing.xs),
            Text(
              job.description,
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            if (job.matchReasons.isNotEmpty)
              KLocalizedText(
                matchReasonBn(job.matchReasons.first),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: KColors.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            // Details stay together; the free space of a short card goes
            // above the button so buttons still line up across the grid.
            const SizedBox(height: KSpacing.sm),
            if (job.startsAt != null)
              KLocalizedText(
                'কাজের সময়: ${KFormat.dateTime(context, job.startsAt!)}',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            if (job.isTimeAvailable)
              const KLocalizedText(
                '✓ আপনার সময়ে মেলে',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: KColors.success,
                  fontWeight: FontWeight.w600,
                ),
              )
            else if (job.isTimeUnavailable)
              const KLocalizedText(
                'সময় যোগ করলে আবেদন করা যাবে',
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: KColors.warning,
                  fontWeight: FontWeight.w600,
                ),
              ),
            if (KFormat.moneyRange(
                  context,
                  job.budgetMinPoisha,
                  job.budgetMaxPoisha,
                )
                case final amount?)
              Text(
                amount,
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            const Spacer(),
            if (actionLabel != null) ...[
              const SizedBox(height: KSpacing.sm),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: onAction,
                  child: KLocalizedText(actionLabel!),
                ),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}

int opportunityGridColumns(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  final textScale = MediaQuery.textScalerOf(context).scale(16) / 16;
  if (width < 400) return 1;
  if (width < 680 && textScale >= 1.5) return 1;
  return width >= 680 ? 3 : 2;
}

double opportunityCardHeight(BuildContext context) {
  final scale = (MediaQuery.textScalerOf(context).scale(16) / 16).clamp(1, 2);
  final accessible = opportunityGridColumns(context) == 1;
  return 424 + ((scale - 1) * (accessible ? 356 : 160));
}

class RetryPanel extends StatelessWidget {
  const RetryPanel({
    super.key,
    required this.label,
    required this.onRetry,
    this.error,
  });
  final String label;
  final VoidCallback onRetry;

  /// The load error, so a known server code (subscription, restriction,
  /// no internet) is explained instead of the generic [label].
  final Object? error;
  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          error == null
              ? KaajLocalizations.text(context, label)
              : failureText(context, error!, label),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: KSpacing.sm),
        FilledButton(
          onPressed: onRetry,
          child: const KLocalizedText('আবার চেষ্টা করুন'),
        ),
      ],
    ),
  );
}

/// A refusal shown in place, read out by screen readers.
class InlineError extends StatelessWidget {
  const InlineError({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.error_outline, color: KColors.danger, size: 20),
        const SizedBox(width: KSpacing.xs),
        Expanded(
          child: Text(message, style: const TextStyle(color: KColors.danger)),
        ),
      ],
    ),
  );
}

String matchReasonBn(String reason) => switch (reason) {
  'Skills match' => 'আপনার দক্ষতার সঙ্গে মেলে',
  'Nearby service area' => 'আপনার কাছাকাছি কাজ',
  'Available for this time' => 'আপনার খালি সময়ের সঙ্গে মেলে',
  'Rate fits the budget' => 'পারিশ্রমিক আপনার রেটের সঙ্গে মেলে',
  'Relevant experience' => 'আপনার অভিজ্ঞতার সঙ্গে মেলে',
  'Strong worker rating' => 'রেটিং অনুযায়ী ভালো মিল',
  'Reliable work history' => 'নির্ভরযোগ্যতার সঙ্গে মেলে',
  _ => reason,
};

/// Whether any of [fields] contains [query], ignoring case. An empty query
/// matches everything. Searches Bangla and English names alike.
bool matchesSearch(String query, Iterable<String?> fields) {
  final needle = query.trim().toLowerCase();
  if (needle.isEmpty) return true;
  return fields.any((field) => field?.toLowerCase().contains(needle) ?? false);
}

/// Shown when a search filters every item out.
class NoSearchMatches extends StatelessWidget {
  const NoSearchMatches({super.key});

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: const [
      SizedBox(height: 160),
      Center(child: KLocalizedText('খোঁজার সঙ্গে কিছু মেলেনি।')),
    ],
  );
}

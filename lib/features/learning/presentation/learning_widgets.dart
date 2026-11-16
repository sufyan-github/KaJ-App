import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../domain/learning_models.dart';

/// Bangla source label for the kind of learning.
String learningKindLabel(LearningKind kind) => switch (kind) {
  LearningKind.training => 'প্রশিক্ষণ',
  LearningKind.apprenticeship => 'শিক্ষানবিশি',
};

String deliveryModeLabel(DeliveryMode mode) => switch (mode) {
  DeliveryMode.onSite => 'নির্দিষ্ট জায়গায়',
  DeliveryMode.homeBased => 'বাড়ি থেকে',
  DeliveryMode.remote => 'অনলাইনে',
  DeliveryMode.hybrid => 'জায়গায় ও অনলাইনে',
};

String termsShortLabel(ParticipantTerms terms) => switch (terms) {
  ParticipantTerms.free => 'বিনামূল্যে',
  ParticipantTerms.paidByParticipant => 'ফি দিতে হবে',
  ParticipantTerms.stipend => 'ভাতা পাবেন',
  ParticipantTerms.unpaid => 'ভাতা নেই',
};

/// The money terms in one line, with the amount in the digits of the reader:
/// "Free", "You pay ৳500", "You receive ৳3,000", "No allowance".
String termsLine(BuildContext context, LearningOpportunity opportunity) {
  final label = KaajLocalizations.text(
    context,
    termsShortLabel(opportunity.terms),
  );
  final amount = switch (opportunity.terms) {
    ParticipantTerms.paidByParticipant => opportunity.feePoisha,
    ParticipantTerms.stipend => opportunity.stipendPoisha,
    _ => null,
  };
  return amount == null ? label : '$label: ${KFormat.money(context, amount)}';
}

/// What the terms mean for the learner, in plain words.
String termsExplanation(ParticipantTerms terms) => switch (terms) {
  ParticipantTerms.free =>
    'এই শেখার জন্য আপনাকে কোনো টাকা দিতে হবে না, আর আপনি কোনো ভাতাও পাবেন না।',
  ParticipantTerms.paidByParticipant =>
    'এই শেখার জন্য আপনাকে মেন্টরকে ফি দিতে হবে। টাকা দেওয়ার আগে শর্ত মিলিয়ে নিন।',
  ParticipantTerms.stipend =>
    'শেখার সময় মেন্টর আপনাকে ভাতা দেবেন। এটি চাকরি বা বেতন নয়।',
  ParticipantTerms.unpaid =>
    'এখানে কাজ করে শিখবেন, কিন্তু কোনো ভাতা বা বেতন নেই। এটি চাকরি নয়।',
};

Color _termsColor(ParticipantTerms terms) => switch (terms) {
  ParticipantTerms.free => KColors.success,
  ParticipantTerms.stipend => KColors.primary,
  ParticipantTerms.paidByParticipant => KColors.warning,
  ParticipantTerms.unpaid => KColors.textSecondary,
};

/// The terms as a coloured badge, always shown on a learning card.
class TermsBadge extends StatelessWidget {
  const TermsBadge({required this.opportunity, super.key});

  final LearningOpportunity opportunity;

  @override
  Widget build(BuildContext context) {
    final color = _termsColor(opportunity.terms);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .14),
        borderRadius: BorderRadius.circular(KRadius.md),
        border: Border.all(color: color.withValues(alpha: .5)),
      ),
      child: Text(
        termsLine(context, opportunity),
        style: TextStyle(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class LearningOpportunityCard extends StatelessWidget {
  const LearningOpportunityCard({
    required this.opportunity,
    this.trailing,
    super.key,
  });

  final LearningOpportunity opportunity;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final theme = Theme.of(context);
    final area = opportunity.areaFor(language);
    final startsAt = opportunity.startsAt;
    return Card(
      key: ValueKey('learning-${opportunity.id}'),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () =>
            context.push(AppRoutes.learningOpportunity(opportunity.id)),
        child: Padding(
          padding: const EdgeInsets.all(KSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: KSpacing.sm,
                runSpacing: KSpacing.xs,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Chip(
                    visualDensity: VisualDensity.compact,
                    avatar: const Icon(Icons.school_outlined, size: 16),
                    label: KLocalizedText(learningKindLabel(opportunity.kind)),
                  ),
                  TermsBadge(opportunity: opportunity),
                ],
              ),
              const SizedBox(height: KSpacing.xs),
              Text(opportunity.title, style: theme.textTheme.titleMedium),
              if (opportunity.mentor?.displayName.isNotEmpty ?? false)
                Text(
                  '${KaajLocalizations.text(context, 'মেন্টর')}: '
                  '${opportunity.mentor!.displayName}',
                  style: theme.textTheme.bodySmall,
                ),
              const SizedBox(height: KSpacing.xs),
              Text(
                [
                  KaajLocalizations.text(
                    context,
                    deliveryModeLabel(opportunity.deliveryMode),
                  ),
                  if (area.isNotEmpty) area,
                  if (startsAt != null) KFormat.dayAndTime(context, startsAt),
                ].join(' · '),
                style: theme.textTheme.bodySmall,
              ),
              if (opportunity.seatsLeft != null)
                Text(
                  '${KaajLocalizations.text(context, 'খালি আসন')}: '
                  '${KFormat.count(context, opportunity.seatsLeft!)}',
                  style: theme.textTheme.bodySmall,
                ),
              if (trailing != null) ...[
                const SizedBox(height: KSpacing.xs),
                trailing!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

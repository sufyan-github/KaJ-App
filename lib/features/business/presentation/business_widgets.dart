import 'package:flutter/material.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import '../domain/business_models.dart';

String businessStageLabel(BusinessStage stage) => switch (stage) {
  BusinessStage.idea => 'আইডিয়া পর্যায়',
  BusinessStage.informal => 'অনিবন্ধিত ব্যবসা',
  BusinessStage.registered => 'নিবন্ধিত ব্যবসা',
};

/// The stage as the server words it, or the app label.
String businessStageText(BuildContext context, Business business) {
  final language = Localizations.localeOf(context).languageCode;
  return business.stageLabel.isEmpty
      ? KaajLocalizations.text(context, businessStageLabel(business.stage))
      : business.stageLabel.forLanguage(language);
}

String businessRoleLabel(BusinessRole? role) => switch (role) {
  BusinessRole.owner => 'মালিক',
  BusinessRole.manager => 'ম্যানেজার',
  BusinessRole.staff => 'স্টাফ',
  null => 'সদস্য',
};

String collaborationStatusLabel(String status) => switch (status) {
  'PROPOSED' => 'প্রস্তাব পাঠানো হয়েছে',
  'ACCEPTED' => 'গ্রহণ করা হয়েছে',
  'DECLINED' => 'প্রত্যাখ্যাত',
  'WITHDRAWN' => 'প্রত্যাহার করা হয়েছে',
  'AGREED' => 'নীতিগতভাবে সম্মত',
  'ENDED' => 'শেষ হয়েছে',
  _ => 'অবস্থা অজানা',
};

Color collaborationStatusColor(String status) => switch (status) {
  'ACCEPTED' || 'AGREED' => KColors.success,
  'PROPOSED' => KColors.info,
  'DECLINED' || 'WITHDRAWN' => KColors.danger,
  _ => KColors.textSecondary,
};

/// "Verified business" badge; only a registered, approved business has it.
class BusinessVerifiedBadge extends StatelessWidget {
  const BusinessVerifiedBadge({super.key});

  @override
  Widget build(BuildContext context) => Row(
    key: const ValueKey('business-verified'),
    mainAxisSize: MainAxisSize.min,
    children: [
      const Icon(Icons.verified, color: KColors.success, size: 18),
      const SizedBox(width: KSpacing.xs),
      KLocalizedText(
        'যাচাইকৃত ব্যবসা',
        style: Theme.of(
          context,
        ).textTheme.labelMedium?.copyWith(color: KColors.success),
      ),
    ],
  );
}

/// A small coloured label.
class BusinessPill extends StatelessWidget {
  const BusinessPill(this.label, {this.color = KColors.info, super.key});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(
      horizontal: KSpacing.sm,
      vertical: KSpacing.xs / 2,
    ),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .14),
      borderRadius: BorderRadius.circular(KRadius.pill),
    ),
    child: KLocalizedText(
      label,
      style: Theme.of(context).textTheme.labelMedium?.copyWith(color: color),
    ),
  );
}

/// One business in a list: name, stage, sector, area and the badge.
class BusinessCard extends StatelessWidget {
  const BusinessCard({
    required this.business,
    required this.onTap,
    this.trailing,
    super.key,
  });

  final Business business;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final theme = Theme.of(context);
    final details = [
      businessStageText(context, business),
      if (business.category != null) business.category!.nameFor(language),
      if (business.area != null) business.area!.nameFor(language),
    ];
    return Card(
      key: ValueKey('business-${business.id}'),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(KSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                backgroundColor: KColors.primary.withValues(alpha: .12),
                child: const Icon(
                  Icons.storefront_outlined,
                  color: KColors.primary,
                ),
              ),
              const SizedBox(width: KSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(business.name, style: theme.textTheme.titleMedium),
                    const SizedBox(height: KSpacing.xs),
                    Text(details.join(' · '), style: theme.textTheme.bodySmall),
                    if (business.description != null) ...[
                      const SizedBox(height: KSpacing.xs),
                      Text(
                        business.description!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: KSpacing.xs),
                    Wrap(
                      spacing: KSpacing.sm,
                      runSpacing: KSpacing.xs,
                      children: [
                        if (business.verified) const BusinessVerifiedBadge(),
                        if (business.myRole != null)
                          BusinessPill(businessRoleLabel(business.myRole)),
                        if (business.isSuspended)
                          const BusinessPill('স্থগিত', color: KColors.danger),
                        if (business.seekingPartners)
                          const BusinessPill(
                            'অংশীদার খুঁজছে',
                            color: KColors.success,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              ?trailing,
            ],
          ),
        ),
      ),
    );
  }
}

/// The server notice that connecting is not a legal partnership, in the
/// language of the reader. Shown on every collaboration screen.
class CollaborationNoticeCard extends StatelessWidget {
  const CollaborationNoticeCard({required this.notice, super.key});

  final BnEn notice;

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    return Card(
      key: const ValueKey('collaboration-notice'),
      color: KColors.surfaceAlt,
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.info_outline, color: KColors.warning),
            const SizedBox(width: KSpacing.sm),
            Expanded(
              child: notice.isEmpty
                  ? const KLocalizedText(
                      'KAAJ শুধু মানুষকে যুক্ত করে। এখানে যুক্ত হওয়া কোনো আইনি অংশীদারত্ব তৈরি করে না।',
                    )
                  : Text(notice.forLanguage(language)),
            ),
          ],
        ),
      ),
    );
  }
}

/// A load error: "not available" for a 404 (the server hides what the
/// person may not see), otherwise the error with a retry.
class BusinessLoadError extends StatelessWidget {
  const BusinessLoadError({
    required this.error,
    required this.label,
    required this.onRetry,
    super.key,
  });

  final Object error;
  final String label;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (ErrorMapper.from(error).kind == FailureKind.notFound) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: KSpacing.xl),
          KEmptyState(
            icon: Icons.visibility_off_outlined,
            title: 'এটি পাওয়া যাচ্ছে না',
            message:
                'এটি সরানো হয়েছে, ব্যক্তিগত করা হয়েছে, বা আপনি এটি দেখতে পারেন না।',
          ),
        ],
      );
    }
    return RetryPanel(error: error, label: label, onRetry: onRetry);
  }
}

/// A section heading inside a details list.
class BusinessSectionTitle extends StatelessWidget {
  const BusinessSectionTitle(this.title, {this.trailing, super.key});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: KSpacing.lg, bottom: KSpacing.sm),
    child: Row(
      children: [
        Expanded(
          child: KLocalizedText(
            title,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        ?trailing,
      ],
    ),
  );
}

/// Asks a yes or no question. Returns true on yes.
Future<bool> confirmBusinessAction(
  BuildContext context, {
  required String title,
  required String message,
  required String confirm,
}) async =>
    await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: KLocalizedText(title),
        content: KLocalizedText(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const KLocalizedText('বাতিল'),
          ),
          FilledButton(
            key: const ValueKey('confirm-action'),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: KLocalizedText(confirm),
          ),
        ],
      ),
    ) ??
    false;

/// Amount in taka typed by the person to a poisha string, or null.
String? takaToPoisha(String text) {
  final taka = text.trim();
  if (taka.isEmpty) return null;
  final value = double.tryParse(taka);
  if (value == null || value < 0) return null;
  return (value * 100).round().toString();
}

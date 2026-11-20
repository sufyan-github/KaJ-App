import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_error_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../domain/idea_models.dart';
import '../idea_routes.dart';

/// Bangla labels (catalog keys) for the idea enums.
String ideaStageLabel(String stage) => switch (stage) {
  IdeaStages.concept => 'ধারণার পর্যায়',
  IdeaStages.validating => 'যাচাইয়ের পর্যায়',
  IdeaStages.pilot => 'পরীক্ষামূলক চালু',
  IdeaStages.converted => 'ব্যবসায় রূপ নিয়েছে',
  _ => 'আইডিয়ার পর্যায়',
};

String ideaVisibilityLabel(String? visibility) => switch (visibility) {
  IdeaVisibilities.summaryPublic => 'সারাংশ সবার জন্য খোলা',
  IdeaVisibilities.members => 'শুধু আইডিয়ার দল',
  _ => 'গোপন আইডিয়া',
};

String ideaVisibilityExplanation(String visibility) => switch (visibility) {
  IdeaVisibilities.summaryPublic =>
    'শিরোনাম ও এক লাইনের সারাংশ খোঁজে সবাই দেখবেন। সমস্যা, সমাধান ও বিস্তারিত দেখবেন শুধু আপনার দল ও আপনি যাঁদের অনুমতি দেন। এর জন্য আপনার পরিচয় যাচাই (এনআইডি ও সেলফি) থাকতে হবে।',
  IdeaVisibilities.members =>
    'শুধু আপনার দলের সদস্যরা দেখবেন। আগে যাঁদের অনুমতি দিয়েছিলেন, তাঁদের অনুমতি এই সময় স্থগিত থাকবে।',
  _ =>
    'শুধু আপনি, আপনার দল ও আপনি যাঁদের অনুমতি দেন তাঁরা দেখবেন। খোঁজে আসবে না।',
};

String ideaRoleTypeLabel(String roleType) => switch (roleType) {
  'CO_FOUNDER' => 'সহ-প্রতিষ্ঠাতা',
  'TECHNICAL' => 'কারিগরি অংশীদার',
  'MARKETING' => 'বিপণন অংশীদার',
  'OPERATIONS' => 'পরিচালনা অংশীদার',
  'INDUSTRY_EXPERT' => 'শিল্প বিশেষজ্ঞ',
  'MENTOR' => 'আইডিয়ার মেন্টর',
  'SUPPLIER' => 'সরবরাহকারী',
  'DISTRIBUTION' => 'বিতরণ অংশীদার',
  'PRODUCTION' => 'উৎপাদন অংশীদার',
  'RESEARCH' => 'গবেষণা সহযোগী',
  _ => 'আইডিয়ার ভূমিকা',
};

String ideaTimeLabel(String value) => switch (value) {
  'FEW_HOURS_A_WEEK' => 'সপ্তাহে কয়েক ঘণ্টা',
  'PART_TIME' => 'খণ্ডকালীন সময়',
  'FULL_TIME' => 'পূর্ণকালীন সময়',
  'FLEXIBLE' => 'সময় নিয়ে নমনীয়',
  _ => 'সময় ঠিক হয়নি',
};

String ideaArrangementLabel(String? value) => switch (value) {
  'PAID' => 'পারিশ্রমিক দেওয়া হবে',
  'EQUITY_TO_DISCUSS' => 'অংশীদারি নিয়ে আলোচনা হবে',
  'VOLUNTEER' => 'স্বেচ্ছাসেবী কাজ',
  _ => 'শর্ত এখনো ঠিক হয়নি',
};

String ideaRoleStatusLabel(String value) => switch (value) {
  'FILLED' => 'ভূমিকা পূরণ হয়েছে',
  'CLOSED' => 'ভূমিকা বন্ধ',
  _ => 'ভূমিকা খোলা',
};

String ideaAccessStatusLabel(String value) => switch (value) {
  'REQUESTED' => 'অনুমতির অপেক্ষায়',
  'APPROVED' => 'অনুমতি দেওয়া হয়েছে',
  'DECLINED' => 'অনুরোধ গ্রহণ করা হয়নি',
  'REVOKED' => 'অনুমতি তুলে নেওয়া হয়েছে',
  _ => 'অনুরোধের অবস্থা অজানা',
};

/// The server label in the current language, else our own.
String ideaStageText(BuildContext context, Idea idea) {
  final language = Localizations.localeOf(context).languageCode;
  return idea.stageLabel.isEmpty
      ? KaajLocalizations.text(context, ideaStageLabel(idea.stage))
      : idea.stageLabel.forLanguage(language);
}

String ideaRoleText(BuildContext context, IdeaRole role) {
  final language = Localizations.localeOf(context).languageCode;
  return role.roleLabel.isEmpty
      ? KaajLocalizations.text(context, ideaRoleTypeLabel(role.roleType))
      : role.roleLabel.forLanguage(language);
}

/// "Label: value" from a Bangla key and a dynamic value.
String ideaLabelled(BuildContext context, String key, String value) =>
    '${KaajLocalizations.text(context, key)}: $value';

/// A public idea card, used in Explore and My activity.
class IdeaCardTile extends StatelessWidget {
  const IdeaCardTile({required this.idea, this.badges = const [], super.key});

  final Idea idea;

  /// Extra chips (status, converted) shown above the summary.
  final List<Widget> badges;

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final theme = Theme.of(context);
    final open = idea.openRoles;
    return Card(
      key: ValueKey('idea-${idea.id}'),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      child: InkWell(
        onTap: () => context.push(IdeaPaths.detail(idea.id)),
        child: Padding(
          padding: const EdgeInsets.all(KSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(idea.title, style: theme.textTheme.titleMedium),
              const SizedBox(height: KSpacing.xs),
              Wrap(
                spacing: KSpacing.xs,
                runSpacing: KSpacing.xs,
                children: [
                  _Pill(text: ideaStageText(context, idea)),
                  if (idea.category case final sector?)
                    _Pill(text: sector.nameFor(language)),
                  if (idea.area case final area?)
                    _Pill(
                      icon: Icons.place_outlined,
                      text: area.nameFor(language),
                    ),
                  ...badges,
                ],
              ),
              const SizedBox(height: KSpacing.sm),
              Text(idea.summary),
              const SizedBox(height: KSpacing.sm),
              IdeaOwnerLine(owner: idea.owner),
              if (open.isNotEmpty) ...[
                const SizedBox(height: KSpacing.xs),
                Text(
                  ideaLabelled(
                    context,
                    'যাঁদের খোঁজা হচ্ছে',
                    open.map((role) => ideaRoleText(context, role)).join(', '),
                  ),
                  style: theme.textTheme.bodySmall,
                ),
              ],
              Text(
                ideaLabelled(
                  context,
                  'দলের আকার',
                  KFormat.count(context, idea.teamSize),
                ),
                style: theme.textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class IdeaOwnerLine extends StatelessWidget {
  const IdeaOwnerLine({required this.owner, super.key});

  final IdeaPerson owner;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      const Icon(Icons.person_outline, size: 18),
      const SizedBox(width: KSpacing.xs),
      Flexible(child: Text(owner.displayName)),
      if (owner.identityVerified) ...[
        const SizedBox(width: KSpacing.xs),
        const Icon(Icons.verified, size: 16, color: KColors.primary),
        const SizedBox(width: 2),
        const Flexible(
          child: KLocalizedText(
            'পরিচয় যাচাই করা',
            style: TextStyle(color: KColors.primary, fontSize: 12),
          ),
        ),
      ],
    ],
  );
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, this.icon});

  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Chip(
    visualDensity: VisualDensity.compact,
    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    avatar: icon == null ? null : Icon(icon, size: 16),
    label: Text(text),
  );
}

/// A small chip with a Bangla key.
class IdeaBadge extends StatelessWidget {
  const IdeaBadge({required this.label, this.color, super.key});

  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) => Chip(
    visualDensity: VisualDensity.compact,
    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    backgroundColor: color?.withValues(alpha: .15),
    label: KLocalizedText(label, style: TextStyle(color: color)),
  );
}

/// A server notice (confidentiality, not a legal partnership) in the
/// current language.
class IdeaNoticeCard extends StatelessWidget {
  const IdeaNoticeCard({
    required this.notice,
    this.icon = Icons.lock_outline,
    super.key,
  });

  final IdeaText notice;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    return Card(
      color: KColors.warning.withValues(alpha: .12),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: KColors.warning),
            const SizedBox(width: KSpacing.sm),
            Expanded(child: Text(notice.forLanguage(language))),
          ],
        ),
      ),
    );
  }
}

/// Bangla notice text the app shows before the server gives its own.
class IdeaStaticNotice extends StatelessWidget {
  const IdeaStaticNotice({
    required this.text,
    this.icon = Icons.info_outline,
    super.key,
  });

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Card(
    color: KColors.info.withValues(alpha: .10),
    margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: KColors.info),
          const SizedBox(width: KSpacing.sm),
          Expanded(child: KLocalizedText(text)),
        ],
      ),
    ),
  );
}

bool isIdeaNotFound(Object error) =>
    ErrorMapper.from(error).kind == FailureKind.notFound;

/// The load failed: a 404 means the viewer may not see it (or it is gone),
/// anything else can be retried.
class IdeaLoadError extends StatelessWidget {
  const IdeaLoadError({
    required this.error,
    required this.onRetry,
    this.onOpenIdea,
    super.key,
  });

  final Object error;
  final VoidCallback onRetry;
  final VoidCallback? onOpenIdea;

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    padding: const EdgeInsets.all(KSpacing.md),
    children: [
      if (isIdeaNotFound(error))
        KEmptyState(
          key: const ValueKey('idea-not-available'),
          icon: Icons.lock_outline,
          title: 'আইডিয়াটি পাওয়া যাচ্ছে না',
          message: 'এটি সরিয়ে ফেলা হয়েছে, অথবা আপনার এটি দেখার অনুমতি নেই।',
          actionLabel: onOpenIdea == null ? null : 'আইডিয়াটি খুলুন',
          onAction: onOpenIdea,
        )
      else
        KErrorState(
          failure: ErrorMapper.from(error),
          retryLabel: 'আবার চেষ্টা করুন',
          onRetry: onRetry,
        ),
    ],
  );
}

/// Asks to confirm a step; returns true when confirmed.
Future<bool> confirmIdeaAction(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
}) async {
  final confirmed = await showDialog<bool>(
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
          key: const ValueKey('idea-confirm'),
          style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
          onPressed: () => Navigator.pop(dialogContext, true),
          child: KLocalizedText(confirmLabel),
        ),
      ],
    ),
  );
  return confirmed ?? false;
}

/// A titled block on a detail screen.
class IdeaSection extends StatelessWidget {
  const IdeaSection({
    required this.title,
    required this.children,
    this.trailing,
    super.key,
  });

  final String title;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: KSpacing.md),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
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
        const SizedBox(height: KSpacing.xs),
        ...children,
      ],
    ),
  );
}

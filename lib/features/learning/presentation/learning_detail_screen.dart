import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_error_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../jobs/presentation/screens/jobs_screens.dart' show jobStatusLabel;
import '../domain/learning_models.dart';
import 'enrolment_screens.dart';
import 'learning_providers.dart';
import 'learning_widgets.dart';

/// A training or apprenticeship. The terms come first, before anything a
/// learner could mistake for a job offer.
class LearningDetailScreen extends ConsumerWidget {
  const LearningDetailScreen({required this.opportunityId, super.key});

  final String opportunityId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(learningDetailProvider(opportunityId));
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('শেখার সুযোগ')),
      body: detail.when(
        skipLoadingOnRefresh: true,
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: KErrorState(
            failure: ErrorMapper.from(error),
            retryLabel: 'আবার চেষ্টা করুন',
            onRetry: () =>
                ref.invalidate(learningDetailProvider(opportunityId)),
          ),
        ),
        data: (item) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(learningDetailProvider(opportunityId));
            await ref
                .read(learningDetailProvider(opportunityId).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: _Body(opportunity: item),
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.opportunity});

  final LearningOpportunity opportunity;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final language = Localizations.localeOf(context).languageCode;
    final theme = Theme.of(context);
    final item = opportunity;
    final startsAt = item.startsAt;
    final endsAt = item.endsAt;
    final open =
        item.status.isEmpty ||
        item.status == 'APPLICATIONS_OPEN' ||
        item.status == 'PUBLISHED';
    final full = item.seatsLeft != null && item.seatsLeft! <= 0;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        Chip(
          avatar: const Icon(Icons.school_outlined, size: 16),
          label: KLocalizedText(learningKindLabel(item.kind)),
        ),
        Text(item.title, style: theme.textTheme.headlineSmall),
        const SizedBox(height: KSpacing.md),
        // Terms first: what it costs or pays, and that it is not a job.
        Card(
          key: const ValueKey('learning-terms'),
          child: Padding(
            padding: const EdgeInsets.all(KSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                KLocalizedText('শর্ত', style: theme.textTheme.titleMedium),
                const SizedBox(height: KSpacing.xs),
                TermsBadge(opportunity: item),
                const SizedBox(height: KSpacing.sm),
                KLocalizedText(termsExplanation(item.terms)),
              ],
            ),
          ),
        ),
        _Row(
          icon: Icons.event_outlined,
          text: [
            if (startsAt != null) KFormat.dayAndTime(context, startsAt),
            if (endsAt != null) KFormat.dayAndTime(context, endsAt),
          ].join(' – '),
        ),
        _Row(
          icon: Icons.place_outlined,
          text: [
            KaajLocalizations.text(
              context,
              deliveryModeLabel(item.deliveryMode),
            ),
            if (item.areaFor(language).isNotEmpty) item.areaFor(language),
          ].join(' · '),
        ),
        if (item.flexibleHours)
          const _Row(
            icon: Icons.schedule,
            localizedText: 'সময় মানিয়ে নেওয়া যায়',
          ),
        if (item.seats != null)
          _Row(
            icon: Icons.event_seat_outlined,
            text:
                '${KaajLocalizations.text(context, 'মোট আসন')}: '
                '${KFormat.count(context, item.seats!)}'
                '${item.seatsLeft == null ? '' : ' · ${KaajLocalizations.text(context, 'খালি আসন')}: ${KFormat.count(context, item.seatsLeft!)}'}',
          ),
        if (item.skillNames.isNotEmpty) ...[
          const SizedBox(height: KSpacing.sm),
          Wrap(
            spacing: KSpacing.sm,
            children: [
              for (final skill in item.skillNames)
                Chip(
                  label: Text(
                    language == 'en' && skill.en.isNotEmpty
                        ? skill.en
                        : skill.bn,
                  ),
                ),
            ],
          ),
        ],
        if (item.mentor case final mentor?) ...[
          const SizedBox(height: KSpacing.sm),
          Card(
            child: ListTile(
              leading: const CircleAvatar(child: Icon(Icons.person_outline)),
              title: Text(mentor.displayName),
              subtitle: Text(
                [
                  KaajLocalizations.text(context, 'মেন্টর'),
                  if (mentor.yearsExperience != null)
                    '${KFormat.count(context, mentor.yearsExperience!)} '
                        '${KaajLocalizations.text(context, 'বছরের অভিজ্ঞতা')}',
                ].join(' · '),
              ),
            ),
          ),
        ],
        const SizedBox(height: KSpacing.sm),
        Text(item.description),
        const SizedBox(height: KSpacing.lg),
        if (item.isMine) ...[
          const KLocalizedText(
            'এটি আপনার প্রকাশ করা শেখার সুযোগ।',
            style: TextStyle(color: KColors.textSecondary),
          ),
          const SizedBox(height: KSpacing.sm),
          if (item.closedToApplications)
            const KLocalizedText(
              'নতুন আবেদন বন্ধ আছে। ভর্তি হওয়া শিক্ষার্থীরা চালিয়ে যাবেন।',
              key: ValueKey('learning-closed'),
            )
          else if (item.status == 'DRAFT' || item.status == 'APPLICATIONS_OPEN')
            _StopApplicationsButton(opportunityId: item.id),
          const SizedBox(height: KSpacing.md),
          MentorApplicationsPanel(opportunityId: item.id),
        ] else if (item.hasApplied)
          Card(
            key: const ValueKey('learning-applied'),
            color: KColors.success.withValues(alpha: .08),
            child: ListTile(
              leading: const Icon(Icons.check_circle, color: KColors.success),
              title: const KLocalizedText('আবেদন করেছেন'),
              subtitle: KLocalizedText(
                jobStatusLabel(item.viewerApplicationStatus!),
              ),
              trailing: item.canWithdraw
                  ? TextButton(
                      key: const ValueKey('learning-withdraw'),
                      onPressed: () => _withdraw(context, ref),
                      child: const KLocalizedText('প্রত্যাহার'),
                    )
                  : null,
            ),
          )
        else if (!open || full)
          KLocalizedText(
            full
                ? 'সব আসন পূর্ণ হয়ে গেছে।'
                : 'এই সুযোগে এখন আবেদন নেওয়া হচ্ছে না।',
            style: const TextStyle(color: KColors.textSecondary),
          )
        else
          KPrimaryButton(
            key: const ValueKey('learning-apply'),
            label: 'শর্ত দেখে আবেদন করুন',
            onPressed: () => _apply(context, ref),
          ),
      ],
    );
  }

  Future<void> _withdraw(BuildContext context, WidgetRef ref) async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const KLocalizedText('আবেদন প্রত্যাহার করবেন?'),
        content: const KLocalizedText(
          'মেন্টর আর আপনার আবেদন দেখবেন না। চাইলে পরে আবার আবেদন করতে পারবেন।',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const KLocalizedText('ফিরুন'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const KLocalizedText('প্রত্যাহার'),
          ),
        ],
      ),
    );
    if (sure != true) return;
    try {
      await ref
          .read(learningRepositoryProvider)
          .withdrawApplication(opportunity.viewerApplicationId!);
      ref.invalidate(learningDetailProvider(opportunity.id));
    } on Object catch (error) {
      if (context.mounted) {
        showFailureSnack(context, error, 'আবেদন প্রত্যাহার করা যায়নি।');
      }
    }
  }

  Future<void> _apply(BuildContext context, WidgetRef ref) async {
    final applied = await showDialog<bool>(
      context: context,
      builder: (_) => _ApplyDialog(opportunity: opportunity),
    );
    if (applied != true) return;
    ref.invalidate(learningDetailProvider(opportunity.id));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: KLocalizedText(
            'আবেদন পাঠানো হয়েছে। মেন্টর গ্রহণ করলে জানানো হবে।',
          ),
        ),
      );
    }
  }
}

class _StopApplicationsButton extends ConsumerStatefulWidget {
  const _StopApplicationsButton({required this.opportunityId});

  final String opportunityId;

  @override
  ConsumerState<_StopApplicationsButton> createState() =>
      _StopApplicationsButtonState();
}

class _StopApplicationsButtonState
    extends ConsumerState<_StopApplicationsButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    key: const ValueKey('learning-close'),
    onPressed: _busy ? null : _close,
    icon: const Icon(Icons.block),
    label: const KLocalizedText('নতুন আবেদন বন্ধ করুন'),
  );

  Future<void> _close() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const KLocalizedText('নতুন আবেদন বন্ধ করবেন?'),
        content: const KLocalizedText(
          'কেউ ভর্তি না হলে সুযোগটি বন্ধ হয়ে যাবে। ভর্তি হওয়া শিক্ষার্থীরা থাকলে তাঁরা চালিয়ে যাবেন, শুধু নতুন আবেদন বন্ধ হবে।',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const KLocalizedText('বাতিল'),
          ),
          FilledButton(
            key: const ValueKey('learning-close-confirm'),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const KLocalizedText('বন্ধ করুন'),
          ),
        ],
      ),
    );
    if (sure != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(learningRepositoryProvider).close(widget.opportunityId);
      ref
        ..invalidate(learningDetailProvider(widget.opportunityId))
        ..invalidate(myLearningOpportunitiesProvider);
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, 'বন্ধ করা যায়নি।');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, this.text, this.localizedText});

  final IconData icon;
  final String? text;
  final String? localizedText;

  @override
  Widget build(BuildContext context) {
    final value = text ?? KaajLocalizations.text(context, localizedText!);
    if (value.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: KSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: KColors.primary),
          const SizedBox(width: KSpacing.sm),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}

/// Shows the terms again, asks the learner to accept them, and keeps any
/// refusal inside the dialog.
class _ApplyDialog extends ConsumerStatefulWidget {
  const _ApplyDialog({required this.opportunity});

  final LearningOpportunity opportunity;

  @override
  ConsumerState<_ApplyDialog> createState() => _ApplyDialogState();
}

class _ApplyDialogState extends ConsumerState<_ApplyDialog> {
  final _message = TextEditingController();
  bool _understood = false;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref
          .read(learningRepositoryProvider)
          .apply(widget.opportunity.id, message: _message.text);
      if (mounted) Navigator.pop(context, true);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        // The shared copy says "job"; learning is never a job.
        _error = ErrorMapper.from(error).code == 'ALREADY_APPLIED'
            ? KaajLocalizations.text(
                context,
                'আপনি এই শেখার সুযোগে আগেই আবেদন করেছেন।',
              )
            : failureText(
                context,
                error,
                'আবেদন পাঠানো যায়নি। আবার চেষ্টা করুন।',
              );
      });
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const KLocalizedText('আবেদনের আগে শর্ত দেখুন'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TermsBadge(opportunity: widget.opportunity),
          const SizedBox(height: KSpacing.sm),
          KLocalizedText(termsExplanation(widget.opportunity.terms)),
          CheckboxListTile(
            key: const ValueKey('learning-understood'),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _understood,
            onChanged: (value) => setState(() => _understood = value ?? false),
            title: const KLocalizedText('আমি শর্তগুলো বুঝেছি'),
          ),
          TextField(
            controller: _message,
            maxLength: 1000,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: KaajLocalizations.text(
                context,
                'মেন্টরকে বার্তা (ঐচ্ছিক)',
              ),
            ),
          ),
          if (_error case final error?)
            Semantics(
              liveRegion: true,
              child: Text(error, style: const TextStyle(color: KColors.danger)),
            ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: _sending ? null : () => Navigator.pop(context, false),
        child: const KLocalizedText('ফিরুন'),
      ),
      FilledButton(
        key: const ValueKey('learning-send'),
        onPressed: !_understood || _sending ? null : _send,
        child: const KLocalizedText('আবেদন পাঠান'),
      ),
    ],
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import '../domain/ai_models.dart';
import 'ai_common.dart';
import 'ai_providers.dart';

/// The idea owner's AI analysis: the stored one, and a fresh one on request.
class IdeaAnalysisScreen extends ConsumerStatefulWidget {
  const IdeaAnalysisScreen({required this.ideaId, super.key});

  final String ideaId;

  @override
  ConsumerState<IdeaAnalysisScreen> createState() => _IdeaAnalysisScreenState();
}

class _IdeaAnalysisScreenState extends ConsumerState<IdeaAnalysisScreen> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final stored = ref.watch(storedIdeaAnalysisProvider(widget.ideaId));
    final status = ref.watch(aiStatusProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('আইডিয়ার AI বিশ্লেষণ')),
      body: stored.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => RetryPanel(
          error: error,
          label: 'বিশ্লেষণ লোড করা যায়নি।',
          onRetry: () =>
              ref.invalidate(storedIdeaAnalysisProvider(widget.ideaId)),
        ),
        data: (analysis) => RefreshIndicator(
          onRefresh: () async {
            ref
              ..invalidate(aiStatusProvider)
              ..invalidate(storedIdeaAnalysisProvider(widget.ideaId));
            await ref
                .read(storedIdeaAnalysisProvider(widget.ideaId).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(KSpacing.md),
            children: [
              if (status != null && status.enabled) ...[
                FilledButton.icon(
                  key: const ValueKey('ai-analyse'),
                  onPressed: _busy ? null : _analyse,
                  icon: _busy
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.auto_awesome),
                  label: KLocalizedText(
                    analysis.isEmpty
                        ? 'AI দিয়ে বিশ্লেষণ করুন'
                        : 'আবার বিশ্লেষণ করুন',
                  ),
                ),
                const SizedBox(height: KSpacing.xs),
                const AiQuotaLine(feature: AiFeatures.ideaAnalysis),
              ] else
                const KLocalizedText(
                  'AI সুবিধা এখন বন্ধ। আগের বিশ্লেষণ নিচে দেখা যাবে।',
                  key: ValueKey('ai-off'),
                ),
              const SizedBox(height: KSpacing.md),
              if (analysis.isEmpty)
                const KEmptyState(
                  icon: Icons.auto_awesome_outlined,
                  title: 'এখনো বিশ্লেষণ হয়নি',
                  message:
                      'AI আপনার আইডিয়ার সম্ভাবনা, খরচ, ঝুঁকি ও পরের ধাপ নিয়ে একটি খসড়া দেবে।',
                )
              else
                _AnalysisView(analysis: analysis),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _analyse() async {
    if (!await ensureAiConsent(context, ref) || !mounted) return;
    final status = await ref.read(aiStatusProvider.future);
    if (!mounted) return;
    if (status.quota(AiFeatures.ideaAnalysis).needsSubscription) {
      await showAiSubscribePrompt(context);
      return;
    }
    setState(() => _busy = true);
    try {
      await _run();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _run({bool askedForIdea = false}) async {
    final repository = ref.read(aiRepositoryProvider);
    try {
      await repository.analyseIdea(widget.ideaId, aiLocale(context));
      ref
        ..invalidate(storedIdeaAnalysisProvider(widget.ideaId))
        ..invalidate(aiStatusProvider);
    } on Object catch (error) {
      if (!mounted) return;
      final code = ErrorMapper.from(error).code;
      if (code == 'AI_IDEA_CONSENT_REQUIRED' && !askedForIdea) {
        if (await _allowForIdea() && mounted) {
          await _run(askedForIdea: true);
        }
        return;
      }
      if (code == 'SUBSCRIPTION_REQUIRED') {
        await showAiSubscribePrompt(context);
        return;
      }
      if (code == 'AI_CONSENT_REQUIRED') ref.invalidate(aiStatusProvider);
      final status = ref.read(aiStatusProvider).valueOrNull;
      ref.invalidate(aiStatusProvider);
      showAiFailure(context, error, 'বিশ্লেষণ করা যায়নি।', status: status);
    }
  }

  /// The idea itself must allow AI analysis (`aiConsent`).
  Future<bool> _allowForIdea() async {
    final allow = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const KLocalizedText('এই আইডিয়ায় AI চালু করবেন?'),
        content: const KLocalizedText(
          'বিশ্লেষণের জন্য আইডিয়ার সমস্যা, সমাধান ও বিস্তারিত (ফোন, ইমেইল ও ঠিকানা মুছে) AI-তে পাঠানো হবে। আপনার দলের কারও নাম পাঠানো হয় না।',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const KLocalizedText('বাতিল'),
          ),
          FilledButton(
            key: const ValueKey('ai-allow-idea'),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const KLocalizedText('চালু করুন'),
          ),
        ],
      ),
    );
    if (allow != true) return false;
    try {
      await ref.read(aiRepositoryProvider).allowIdeaAnalysis(widget.ideaId);
      return true;
    } on Object catch (error) {
      if (mounted) showAiFailure(context, error, 'চালু করা যায়নি।');
      return false;
    }
  }
}

class _AnalysisView extends StatelessWidget {
  const _AnalysisView({required this.analysis});

  final IdeaAnalysis analysis;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    String taka(int? value) =>
        value == null ? '—' : '৳${KFormat.count(context, value)}';
    Widget heading(String text) => Padding(
      padding: const EdgeInsets.only(top: KSpacing.md, bottom: KSpacing.xs),
      child: KLocalizedText(text, style: theme.textTheme.titleMedium),
    );
    Widget rated(String title, AiRated value) => ListTile(
      contentPadding: EdgeInsets.zero,
      title: KLocalizedText(title),
      trailing: value.rating == null
          ? null
          : Chip(label: KLocalizedText(_rating(value.rating!))),
      subtitle: value.explanation == null ? null : Text(value.explanation!),
    );
    return Column(
      key: const ValueKey('ai-analysis'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (analysis.analyzedAt case final at?)
          Text(
            '${KaajLocalizations.text(context, 'বিশ্লেষণের সময়:')} '
            '${KFormat.dateTime(context, at)}',
            style: theme.textTheme.bodySmall,
          ),
        const AiCaution(),
        if (analysis.summary case final summary?) Text(summary),
        rated('বাস্তবায়নের সম্ভাবনা', analysis.feasibility),
        rated('স্থানীয় বাজারে চাহিদা', analysis.marketFit),
        if (analysis.targetCustomers.isNotEmpty)
          Text('• ${analysis.targetCustomers.join('\n• ')}'),
        if (analysis.costs.isNotEmpty) ...[
          heading('শুরুর আনুমানিক খরচ'),
          for (final line in analysis.costs)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text(line.item),
              trailing: Text('${taka(line.minBdt)}–${taka(line.maxBdt)}'),
            ),
          Text(
            '${KaajLocalizations.text(context, 'মোট:')} '
            '${taka(analysis.totalMinBdt)}–${taka(analysis.totalMaxBdt)}',
            style: theme.textTheme.titleSmall,
          ),
          if (analysis.costAssumptions case final note?)
            Text(note, style: theme.textTheme.bodySmall),
        ],
        if (analysis.risks.isNotEmpty) ...[
          heading('ঝুঁকি'),
          for (final risk in analysis.risks)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.warning_amber_outlined),
              title: Text(risk.risk),
              subtitle: risk.mitigation == null ? null : Text(risk.mitigation!),
              trailing: risk.severity == null
                  ? null
                  : KLocalizedText(_rating(risk.severity!)),
            ),
        ],
        if (analysis.nextSteps.isNotEmpty) ...[
          heading('পরের ধাপ'),
          for (final step in analysis.nextSteps)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.check_circle_outline),
              title: Text(step.label),
              subtitle: step.why == null ? null : Text(step.why!),
            ),
        ],
        for (final (title, items) in [
          ('KAAJ-এ যেমন বিশেষজ্ঞ খুঁজবেন', analysis.experts),
          ('যা শিখলে কাজে লাগবে', analysis.learning),
          ('যেমন অংশীদার খুঁজবেন', analysis.partners),
        ])
          if (items.isNotEmpty) ...[
            heading(title),
            for (final item in items)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(item.label),
                subtitle: item.why == null ? null : Text(item.why!),
              ),
          ],
      ],
    );
  }
}

String _rating(String value) => switch (value) {
  'HIGH' => 'বেশি',
  'MEDIUM' => 'মাঝারি',
  'LOW' => 'কম',
  _ => 'অজানা',
};

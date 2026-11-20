import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../domain/ai_models.dart';
import 'ai_common.dart';
import 'ai_providers.dart';

/// The next KAAJ step a tip points to, as (label, route).
(String, String)? growthTipAction(String? action, String businessId) =>
    switch (action) {
      'POST_JOB' => ('কর্মী খুঁজতে কাজ পোস্ট করুন', AppRoutes.createJob),
      'FIND_EXPERT' => ('বিশেষজ্ঞ খুঁজুন', '/explore?section=people'),
      'LEARN_SKILL' => ('শেখার সুযোগ দেখুন', AppRoutes.exploreLearn),
      'JOIN_GROUP' => ('কমিউনিটি গ্রুপ দেখুন', '/explore?section=community'),
      'LIST_OFFERING' => ('পণ্য বা সেবা যোগ করুন', '/businesses/$businessId'),
      'FIND_PARTNER' => ('অংশীদার খুঁজুন', '/partners'),
      _ => null,
    };

/// AI growth tips for one business (members only). Not stored.
class GrowthTipsScreen extends ConsumerStatefulWidget {
  const GrowthTipsScreen({required this.businessId, super.key});

  final String businessId;

  @override
  ConsumerState<GrowthTipsScreen> createState() => _GrowthTipsScreenState();
}

class _GrowthTipsScreenState extends ConsumerState<GrowthTipsScreen> {
  bool _busy = false;
  AiGrowthTips? _tips;

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(aiStatusProvider);
    final tips = _tips;
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('ব্যবসা বাড়ানোর টিপস')),
      body: status.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const SizedBox.shrink(),
        data: (status) => !status.enabled
            ? const KEmptyState(
                icon: Icons.auto_awesome_outlined,
                title: 'AI সুবিধা এখন বন্ধ',
                message: 'পরে আবার দেখুন।',
              )
            : ListView(
                padding: const EdgeInsets.all(KSpacing.md),
                children: [
                  FilledButton.icon(
                    key: const ValueKey('ai-growth'),
                    onPressed: _busy ? null : _load,
                    icon: _busy
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.auto_awesome),
                    label: KLocalizedText(
                      tips == null ? 'টিপস দেখুন' : 'নতুন টিপস নিন',
                    ),
                  ),
                  const SizedBox(height: KSpacing.xs),
                  const AiQuotaLine(feature: AiFeatures.growthTips),
                  if (tips != null) ...[
                    const AiCaution(),
                    if (tips.source == 'FALLBACK')
                      const KLocalizedText(
                        'AI এখন উত্তর দিতে পারেনি; KAAJ-এর সাধারণ টিপস দেখানো হলো।',
                        key: ValueKey('ai-fallback'),
                      ),
                    if (tips.summary case final summary?) Text(summary),
                    for (final tip in tips.tips)
                      _TipCard(tip: tip, businessId: widget.businessId),
                  ],
                ],
              ),
      ),
    );
  }

  Future<void> _load() async {
    if (!await ensureAiConsent(context, ref) || !mounted) return;
    setState(() => _busy = true);
    try {
      final tips = await ref
          .read(aiRepositoryProvider)
          .growthTips(widget.businessId, aiLocale(context));
      if (mounted) setState(() => _tips = tips);
    } on Object catch (error) {
      if (mounted) {
        showAiFailure(
          context,
          error,
          'টিপস আনা যায়নি।',
          status: ref.read(aiStatusProvider).valueOrNull,
        );
      }
    } finally {
      ref.invalidate(aiStatusProvider);
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _TipCard extends StatelessWidget {
  const _TipCard({required this.tip, required this.businessId});

  final AiGrowthTip tip;
  final String businessId;

  @override
  Widget build(BuildContext context) {
    final action = growthTipAction(tip.action, businessId);
    String taka(int value) => '৳${KFormat.count(context, value)}';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(tip.title, style: Theme.of(context).textTheme.titleMedium),
            if (tip.detail case final detail?) Text(detail),
            const SizedBox(height: KSpacing.xs),
            Text(
              [
                if (tip.effort case final effort?)
                  '${KaajLocalizations.text(context, 'পরিশ্রম:')} '
                      '${KaajLocalizations.text(context, _effort(effort))}',
                if (tip.costMin != null && tip.costMax != null)
                  '${KaajLocalizations.text(context, 'খরচ:')} '
                      '${taka(tip.costMin!)}–${taka(tip.costMax!)}',
              ].join(' · '),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (action != null)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  key: ValueKey('tip-action-${tip.action}'),
                  onPressed: () => context.push(action.$2),
                  child: KLocalizedText(action.$1),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String _effort(String value) => switch (value) {
  'HIGH' => 'বেশি',
  'MEDIUM' => 'মাঝারি',
  'LOW' => 'কম',
  _ => 'অজানা',
};

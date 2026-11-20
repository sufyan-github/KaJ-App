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

/// Where a suggestion opens.
String aiSuggestionRoute(AiSuggestion item) => switch (item.type) {
  'JOB' => AppRoutes.jobDetail(item.id),
  'LEARNING' => AppRoutes.learningOpportunity(item.id),
  'MENTOR' => AppRoutes.workerProfile(item.id),
  'GROUP' => '/community/groups/${item.id}',
  _ => AppRoutes.explore,
};

/// Home card that opens AI suggestions; hidden while AI is off.
class AiSuggestionsCard extends ConsumerWidget {
  const AiSuggestionsCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(aiStatusProvider).valueOrNull;
    if (status == null || !status.enabled) return const SizedBox.shrink();
    return Card(
      key: const ValueKey('ai-suggestions-card'),
      margin: const EdgeInsets.only(top: KSpacing.sm),
      child: ListTile(
        leading: const Icon(Icons.auto_awesome, color: KColors.primary),
        title: const KLocalizedText('আপনার জন্য AI পরামর্শ'),
        subtitle: const KLocalizedText(
          'কাছাকাছি কাজ, শেখার সুযোগ, মেন্টর ও গ্রুপ থেকে বাছাই',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push(AiPaths.suggestions),
      ),
    );
  }
}

class AiSuggestionsScreen extends ConsumerStatefulWidget {
  const AiSuggestionsScreen({super.key});

  @override
  ConsumerState<AiSuggestionsScreen> createState() =>
      _AiSuggestionsScreenState();
}

class _AiSuggestionsScreenState extends ConsumerState<AiSuggestionsScreen> {
  bool _busy = false;
  AiSuggestions? _result;

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(aiStatusProvider);
    final result = _result;
    final language = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('AI পরামর্শ')),
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
                    key: const ValueKey('ai-suggest'),
                    onPressed: _busy ? null : _suggest,
                    icon: _busy
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.auto_awesome),
                    label: KLocalizedText(
                      result == null ? 'পরামর্শ দেখুন' : 'নতুন করে পরামর্শ নিন',
                    ),
                  ),
                  const SizedBox(height: KSpacing.xs),
                  const AiQuotaLine(feature: AiFeatures.suggestions),
                  if (result != null) ...[
                    const AiCaution(),
                    if (result.source == 'FALLBACK')
                      const KLocalizedText(
                        'AI এখন সাজাতে পারেনি; KAAJ-এর নিজের তালিকা দেখানো হলো।',
                        key: ValueKey('ai-fallback'),
                      ),
                    if (result.summary case final summary?)
                      Padding(
                        padding: const EdgeInsets.only(bottom: KSpacing.sm),
                        child: Text(summary),
                      ),
                    if (result.items.isEmpty)
                      const KEmptyState(
                        icon: Icons.search_off,
                        title: 'এখন কোনো পরামর্শ নেই',
                        message:
                            'প্রোফাইলে দক্ষতা ও এলাকা যোগ করলে আরও ভালো পরামর্শ পাবেন।',
                      ),
                    for (final item in result.items)
                      Card(
                        key: ValueKey('ai-item-${item.type}-${item.id}'),
                        child: ListTile(
                          leading: Icon(_icon(item.type)),
                          title: Text(item.title),
                          subtitle: Text(
                            [
                              KaajLocalizations.text(
                                context,
                                _label(item.type),
                              ),
                              ?(language == 'bn' ? item.areaBn : item.areaEn),
                              ?item.reason,
                            ].join(' · '),
                          ),
                          trailing: item.score == null
                              ? const Icon(Icons.chevron_right)
                              : Text(KFormat.count(context, item.score!)),
                          onTap: () => context.push(aiSuggestionRoute(item)),
                        ),
                      ),
                  ],
                ],
              ),
      ),
    );
  }

  Future<void> _suggest() async {
    if (!await ensureAiConsent(context, ref) || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await ref
          .read(aiRepositoryProvider)
          .suggestions(aiLocale(context));
      if (mounted) setState(() => _result = result);
    } on Object catch (error) {
      if (mounted) {
        showAiFailure(
          context,
          error,
          'পরামর্শ আনা যায়নি।',
          status: ref.read(aiStatusProvider).valueOrNull,
        );
      }
    } finally {
      ref.invalidate(aiStatusProvider);
      if (mounted) setState(() => _busy = false);
    }
  }
}

IconData _icon(String type) => switch (type) {
  'JOB' => Icons.work_outline,
  'LEARNING' => Icons.school_outlined,
  'MENTOR' => Icons.person_outline,
  'GROUP' => Icons.diversity_3_outlined,
  _ => Icons.auto_awesome_outlined,
};

String _label(String type) => switch (type) {
  'JOB' => 'কাজের সুযোগ',
  'LEARNING' => 'শেখার সুযোগ',
  'MENTOR' => 'মেন্টর',
  'GROUP' => 'কমিউনিটি গ্রুপ',
  _ => 'সুযোগ',
};

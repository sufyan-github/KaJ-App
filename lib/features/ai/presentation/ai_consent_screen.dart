import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import 'ai_providers.dart';

/// The consent text this app version shows (docs/api/ai.md, version 1).
/// Its English rendering is in the AI catalog.
const aiConsentVersion = 1;
const aiConsentText =
    'KAAJ AI আপনার আইডিয়া বিশ্লেষণ, সুযোগের পরামর্শ ও ব্যবসার টিপস দিতে Anthropic-এর Claude মডেল ব্যবহার করে। আপনি কোনো AI সুবিধা ব্যবহার করলে, উত্তর তৈরির জন্য সেই সুবিধার দরকারি তথ্য — আপনার আইডিয়া বা ব্যবসার বিবরণ, আপনার দক্ষতা ও এলাকা, এবং KAAJ-এ থাকা সুযোগগুলো — Anthropic-এ পাঠানো হয়। পাঠানোর আগে ফোন নম্বর, ইমেইল, এনআইডি নম্বর ও সঠিক ঠিকানা মুছে ফেলা হয়, আর অন্য কারও ব্যক্তিগত তথ্য কখনো পাঠানো হয় না। AI-এর উত্তর ভুল হতে পারে: গুরুত্বপূর্ণ সিদ্ধান্তের আগে বিশেষজ্ঞের সাথে মিলিয়ে নিন। আপনি যেকোনো সময় এটি বন্ধ করতে পারেন।';

/// Opt in to KAAJ AI, or withdraw. Pops `true` after agreeing.
class AiConsentScreen extends ConsumerStatefulWidget {
  const AiConsentScreen({super.key});

  @override
  ConsumerState<AiConsentScreen> createState() => _AiConsentScreenState();
}

class _AiConsentScreenState extends ConsumerState<AiConsentScreen> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(aiStatusProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('KAAJ AI ও আপনার তথ্য')),
      body: status.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => RetryPanel(
          error: error,
          label: 'AI-এর অবস্থা জানা যায়নি।',
          onRetry: () => ref.invalidate(aiStatusProvider),
        ),
        data: (status) {
          if (!status.enabled) {
            return const KEmptyState(
              icon: Icons.auto_awesome_outlined,
              title: 'AI সুবিধা এখন বন্ধ',
              message: 'KAAJ AI চালু হলে এখানে অনুমতি দিতে পারবেন।',
            );
          }
          // A newer consent text than this app knows: never accept a text
          // the person was not shown.
          final outdated = status.currentVersion != aiConsentVersion;
          return ListView(
            padding: const EdgeInsets.all(KSpacing.lg),
            children: [
              const Icon(Icons.auto_awesome, size: 40, color: KColors.primary),
              const SizedBox(height: KSpacing.md),
              const KLocalizedText(
                aiConsentText,
                key: ValueKey('ai-consent-text'),
              ),
              const SizedBox(height: KSpacing.lg),
              if (outdated)
                const KLocalizedText(
                  'অনুমতির লেখা বদলেছে। নতুন লেখা দেখতে অ্যাপ হালনাগাদ করুন।',
                  style: TextStyle(color: KColors.danger),
                )
              else if (status.consentAccepted) ...[
                Text(
                  [
                    KaajLocalizations.text(context, 'আপনি অনুমতি দিয়েছেন'),
                    if (status.acceptedAt case final at?)
                      KFormat.date(context, at),
                  ].join(' · '),
                  key: const ValueKey('ai-consent-given'),
                ),
                const SizedBox(height: KSpacing.md),
                OutlinedButton.icon(
                  key: const ValueKey('ai-consent-withdraw'),
                  onPressed: _busy ? null : _withdraw,
                  icon: const Icon(Icons.block),
                  label: const KLocalizedText('AI ব্যবহার বন্ধ করুন'),
                ),
              ] else
                FilledButton(
                  key: const ValueKey('ai-consent-accept'),
                  onPressed: _busy
                      ? null
                      : () => _accept(status.currentVersion),
                  child: const KLocalizedText('আমি রাজি, AI চালু করুন'),
                ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _accept(int version) async {
    setState(() => _busy = true);
    try {
      await ref.read(aiRepositoryProvider).giveConsent(version);
      ref.invalidate(aiStatusProvider);
      if (!mounted) return;
      final navigator = Navigator.of(context);
      if (navigator.canPop()) {
        navigator.pop(true);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: KLocalizedText('KAAJ AI চালু হয়েছে।')),
        );
      }
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, 'অনুমতি জমা হয়নি।');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _withdraw() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const KLocalizedText('AI ব্যবহার বন্ধ করবেন?'),
        content: const KLocalizedText(
          'এরপর KAAJ আপনার কোনো তথ্য AI-তে পাঠাবে না। আগের আইডিয়া বিশ্লেষণ আপনার কাছে থেকে যাবে।',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const KLocalizedText('বাতিল'),
          ),
          FilledButton(
            key: const ValueKey('ai-withdraw-confirm'),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const KLocalizedText('বন্ধ করুন'),
          ),
        ],
      ),
    );
    if (sure != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(aiRepositoryProvider).withdrawConsent();
      ref.invalidate(aiStatusProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: KLocalizedText('AI ব্যবহার বন্ধ করা হয়েছে।')),
        );
      }
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, 'বন্ধ করা যায়নি।');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

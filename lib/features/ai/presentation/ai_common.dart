import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../domain/ai_models.dart';
import 'ai_providers.dart';

abstract final class AiPaths {
  static const consent = '/ai/consent';
  static const suggestions = '/ai/suggestions';
  static String ideaAnalysis(String ideaId) => '/ai/ideas/$ideaId/analysis';
  static String growthTips(String businessId) =>
      '/ai/businesses/$businessId/growth-tips';
}

/// Language for AI answers: the app language.
String aiLocale(BuildContext context) =>
    KaajLocalizations.isEnglish(context) ? 'en' : 'bn';

/// [failureText] plus, for a used-up quota, when it comes back.
String aiFailureText(
  BuildContext context,
  Object error,
  String fallback, {
  AiStatus? status,
}) {
  final text = failureText(context, error, fallback);
  final resets = status?.quotaResetsAt;
  if (ErrorMapper.from(error).code == 'AI_QUOTA_EXCEEDED' && resets != null) {
    return '$text ${KaajLocalizations.text(context, 'আবার পাবেন:')} '
        '${KFormat.dateTime(context, resets)}';
  }
  return text;
}

void showAiFailure(
  BuildContext context,
  Object error,
  String fallback, {
  AiStatus? status,
}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(aiFailureText(context, error, fallback, status: status)),
      ),
    );
}

/// Makes sure the person agreed to the current AI consent text; shows the
/// consent screen when not. True when AI may be used now.
Future<bool> ensureAiConsent(BuildContext context, WidgetRef ref) async {
  final status = await ref.read(aiStatusProvider.future);
  if (!status.enabled) return false;
  if (!status.needsConsent) return true;
  if (!context.mounted) return false;
  final accepted = await context.push<bool>(AiPaths.consent);
  ref.invalidate(aiStatusProvider);
  return accepted == true;
}

/// Asks a non-subscriber to subscribe for a subscribers-only AI feature.
Future<void> showAiSubscribePrompt(BuildContext context) async {
  final go = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      icon: const Icon(Icons.workspace_premium_outlined),
      title: const KLocalizedText('এটি গ্রাহকদের জন্য'),
      content: const KLocalizedText(
        'আইডিয়ার AI বিশ্লেষণ শুধু KAAJ গ্রাহকদের জন্য। সাবস্ক্রিপশন চালু করলে দিনে কয়েকবার বিশ্লেষণ করাতে পারবেন।',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const KLocalizedText('পরে'),
        ),
        FilledButton(
          key: const ValueKey('ai-subscribe'),
          onPressed: () => Navigator.pop(dialogContext, true),
          child: const KLocalizedText('সাবস্ক্রিপশন দেখুন'),
        ),
      ],
    ),
  );
  if (go == true && context.mounted) {
    await context.push(AppRoutes.subscription);
  }
}

/// "AI requests left today: 2 of 3", when the server knows.
class AiQuotaLine extends ConsumerWidget {
  const AiQuotaLine({required this.feature, super.key});

  final String feature;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(aiStatusProvider).valueOrNull;
    final quota = status?.quota(feature);
    final left = quota?.remainingToday;
    final limit = quota?.dailyLimit;
    if (left == null || limit == null) return const SizedBox.shrink();
    return Text(
      '${KaajLocalizations.text(context, 'আজ বাকি AI অনুরোধ:')} '
      '${KFormat.count(context, left)}/${KFormat.count(context, limit)}',
      key: ValueKey('ai-quota-$feature'),
      style: Theme.of(context).textTheme.bodySmall,
    );
  }
}

/// Every AI answer carries this reminder.
class AiCaution extends StatelessWidget {
  const AiCaution({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.symmetric(vertical: KSpacing.sm),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.info_outline, size: 18, color: KColors.textSecondary),
        SizedBox(width: KSpacing.xs),
        Expanded(
          child: KLocalizedText(
            'AI-এর উত্তর ভুল হতে পারে। গুরুত্বপূর্ণ সিদ্ধান্তের আগে বিশেষজ্ঞের সাথে মিলিয়ে নিন।',
          ),
        ),
      ],
    ),
  );
}

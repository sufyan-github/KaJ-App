import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/widgets/k_localized_text.dart';
import 'ai_common.dart';
import 'ai_providers.dart';

/// Business page: AI growth tips for members. Hidden while AI is off.
class AiGrowthTipsTile extends ConsumerWidget {
  const AiGrowthTipsTile({required this.businessId, super.key});

  final String businessId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enabled = ref.watch(aiStatusProvider).valueOrNull?.enabled ?? false;
    if (!enabled) return const SizedBox.shrink();
    return ListTile(
      key: const ValueKey('business-ai-growth'),
      leading: const Icon(Icons.auto_awesome_outlined),
      title: const KLocalizedText('ব্যবসা বাড়ানোর টিপস'),
      subtitle: const KLocalizedText('AI থেকে কয়েকটি পরামর্শ'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.push(AiPaths.growthTips(businessId)),
    );
  }
}

/// Settings: see, give or withdraw the KAAJ AI consent. Hidden while AI
/// is off.
class AiSettingsTile extends ConsumerWidget {
  const AiSettingsTile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(aiStatusProvider).valueOrNull;
    if (status == null || !status.enabled) return const SizedBox.shrink();
    return ListTile(
      key: const ValueKey('settings-ai'),
      leading: const Icon(Icons.auto_awesome_outlined),
      title: const KLocalizedText('KAAJ AI'),
      subtitle: KLocalizedText(
        status.consentAccepted
            ? 'চালু আছে · অনুমতি বন্ধ করতে পারবেন'
            : 'বন্ধ আছে · অনুমতি দিলে চালু হবে',
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.push(AiPaths.consent),
    );
  }
}

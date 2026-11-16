import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_empty_state.dart';
import '../../../../core/widgets/k_error_state.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../domain/training_models.dart';
import '../training_providers.dart';
import '../widgets/training_ui.dart';

class CertificatesScreen extends ConsumerWidget {
  const CertificatesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final certificates = ref.watch(myCertificatesProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('আমার সার্টিফিকেট')),
      body: certificates.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: KErrorState(
            failure: ErrorMapper.from(error),
            retryLabel: 'আবার চেষ্টা করুন',
            onRetry: () => ref.invalidate(myCertificatesProvider),
          ),
        ),
        data: (items) => items.isEmpty
            ? Center(
                child: KEmptyState(
                  icon: Icons.workspace_premium_outlined,
                  title: 'এখনো কোনো সার্টিফিকেট নেই',
                  message:
                      'কোর্সের পরীক্ষায় পাস করলে সার্টিফিকেট এখানে দেখা যাবে।',
                  actionLabel: 'কোর্স দেখুন',
                  onAction: () => context.push(AppRoutes.training),
                ),
              )
            : ListView(
                padding: const EdgeInsets.all(KSpacing.md),
                children: [
                  const KLocalizedText(
                    'প্রতিটি সার্টিফিকেট শুধু বলে যে আপনি Kaaj জ্ঞান পরীক্ষায় পাস করেছেন। কোড দিয়ে যে কেউ এটি যাচাই করতে পারেন।',
                    style: TextStyle(color: KColors.textSecondary),
                  ),
                  const SizedBox(height: KSpacing.sm),
                  for (final certificate in items)
                    CertificateCard(certificate: certificate),
                ],
              ),
      ),
    );
  }
}

String certificateShareText(BuildContext context, CertificateSummary item) {
  final title = item.titleFor(languageOf(context));
  if (item.isPractical) {
    return KaajLocalizations.isEnglish(context)
        ? 'I completed practical learning in $title with a KAAJ mentor. Certificate code: ${item.code}'
        : 'আমি KAAJ মেন্টরের সাথে $title হাতে-কলমে শিখেছি। সার্টিফিকেট কোড: ${item.code}';
  }
  return KaajLocalizations.isEnglish(context)
      ? 'I passed the Kaaj knowledge test for $title. Certificate code: ${item.code}'
      : 'আমি $title কোর্সের Kaaj জ্ঞান পরীক্ষায় পাস করেছি। সার্টিফিকেট কোড: ${item.code}';
}

class CertificateCard extends StatelessWidget {
  const CertificateCard({required this.certificate, super.key});

  final CertificateSummary certificate;

  @override
  Widget build(BuildContext context) {
    final english = KaajLocalizations.isEnglish(context);
    final date = KFormat.date(context, certificate.issuedAt);
    final score = KFormat.count(context, certificate.scorePct);
    return Card(
      key: ValueKey('certificate-${certificate.id}'),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  certificate.isValid
                      ? Icons.workspace_premium_outlined
                      : Icons.block_outlined,
                  color: certificate.isValid
                      ? KColors.primary
                      : KColors.textSecondary,
                ),
                const SizedBox(width: KSpacing.sm),
                Expanded(
                  child: Text(
                    certificate.titleFor(languageOf(context)),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: KSpacing.xs),
            if (certificate.isPractical) ...[
              const KLocalizedText('মেন্টরের যাচাই করা হাতে-কলমে শেখা'),
              Text(
                [
                  date,
                  if (certificate.issuedByName?.isNotEmpty ?? false)
                    '${KaajLocalizations.text(context, 'মেন্টর')}: ${certificate.issuedByName}',
                ].join(' · '),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ] else ...[
              const KLocalizedText(knowledgeTestedWording),
              Text(
                english
                    ? 'Issued $date · score $score%'
                    : 'তারিখ $date · নম্বর $score%',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: KSpacing.xs),
            SelectableText(
              english
                  ? 'Code: ${certificate.code}'
                  : 'কোড: ${certificate.code}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            if (certificate.isSafetyCritical) ...[
              const SizedBox(height: KSpacing.xs),
              const Row(
                children: [
                  Icon(Icons.info_outline, size: 18, color: KColors.warning),
                  SizedBox(width: KSpacing.xs),
                  Expanded(
                    child: KLocalizedText(
                      notALicenceWording,
                      style: TextStyle(color: KColors.warning),
                    ),
                  ),
                ],
              ),
            ],
            if (!certificate.isValid)
              const KLocalizedText(
                'এই সার্টিফিকেট বাতিল করা হয়েছে।',
                style: TextStyle(color: KColors.danger),
              ),
            if (certificate.isValid)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () async {
                    final messenger = ScaffoldMessenger.of(context);
                    final copied = KaajLocalizations.text(
                      context,
                      'শেয়ার করার লেখা কপি হয়েছে।',
                    );
                    final text = certificateShareText(context, certificate);
                    await Clipboard.setData(ClipboardData(text: text));
                    messenger
                      ..hideCurrentSnackBar()
                      ..showSnackBar(SnackBar(content: Text(copied)));
                  },
                  icon: const Icon(Icons.share_outlined),
                  label: const KLocalizedText('শেয়ার করুন'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

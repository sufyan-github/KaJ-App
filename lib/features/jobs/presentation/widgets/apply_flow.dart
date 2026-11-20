// The apply flow shared by the job feed, job detail and learning
// opportunities: eligibility check, then the proposal dialog.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failure_copy.dart';
import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../../core/widgets/k_text_field.dart';
import '../../../onboarding/presentation/controllers/onboarding_controller.dart';
import '../../../trust_safety/domain/trust_models.dart';
import '../../../trust_safety/presentation/trust_safety_providers.dart';
import '../../domain/job_models.dart';
import '../controllers/jobs_providers.dart';
import 'opportunity_listing.dart';

/// The apply flow shared by the job feed and the job detail page.
///
/// Checks identity eligibility first, then shows the proposal dialog.
/// [onApplied] runs after the application is accepted by the API.
Future<void> showJobApplyFlow(
  BuildContext context,
  WidgetRef ref,
  JobSummary job, {
  VoidCallback? onApplied,
}) async {
  late final ApplicationEligibility eligibility;
  try {
    // Always ask again: an admin may have approved the identity check since
    // the last attempt.
    eligibility = await ref.refresh(applicationEligibilityProvider.future);
  } on Object catch (error) {
    if (context.mounted) {
      showFailureSnack(
        context,
        error,
        'আবেদনের যোগ্যতা যাচাই করা যায়নি। আবার চেষ্টা করুন।',
      );
    }
    return;
  }
  if (!context.mounted) return;
  if (!eligibility.canApply) {
    final startVerification = await showApplicationRequirements(
      context,
      eligibility,
    );
    if (startVerification == true && context.mounted) {
      await context.push(AppRoutes.verificationCapture('IDENTITY'));
    }
    return;
  }
  final budget = job.budgetMaxPoisha ?? job.budgetMinPoisha;
  final amount = TextEditingController(
    text: budget == null ? '' : budget.wholeTaka.toString(),
  );
  final message = TextEditingController();
  final start = job.startsAt ?? DateTime.now().add(const Duration(days: 1));
  final end = job.endsAt ?? start.add(const Duration(hours: 1));
  // A refusal is shown inside the dialog: a snack bar would sit behind it.
  String? submitError;
  var submitting = false;
  // Set when the server says identity must be verified first (409
  // IDENTITY_REQUIRED, action VERIFY_IDENTITY): offer the way there.
  var needsIdentity = false;
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (dialogContext, setDialogState) => AlertDialog(
        title: const KLocalizedText('এই কাজে আবেদন করুন'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: KLocalizedText(
                  'কাজের সময়: ${KFormat.dateTime(context, start)} – ${KFormat.time(context, end)}',
                ),
              ),
              if (job.isTimeAvailable)
                const ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.event_available, color: KColors.success),
                  title: KLocalizedText(
                    'এই সময়টি আপনার ডিফল্ট সময়ের সঙ্গে মেলে',
                  ),
                ),
              if (job.isTimeUnavailable) ...[
                const ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.event_busy, color: KColors.warning),
                  title: KLocalizedText('এই সময়টি আপনার ডিফল্ট সময়ের বাইরে'),
                  subtitle: KLocalizedText(
                    'আবেদন করার আগে চাইলে পোস্টের সময়টি আপনার কাজের সময়ে যোগ করুন।',
                  ),
                ),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      try {
                        await ref
                            .read(onboardingRepositoryProvider)
                            .addAvailabilityWindow(start, end);
                        ref.invalidate(jobFeedProvider);
                        if (dialogContext.mounted) Navigator.pop(dialogContext);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: KLocalizedText(
                                'পোস্টের সময়টি আপনার ডিফল্ট কাজের সময়ে যোগ হয়েছে। এখন আবেদন করতে পারবেন।',
                              ),
                            ),
                          );
                        }
                      } on Object catch (error) {
                        if (context.mounted) {
                          showFailureSnack(
                            context,
                            error,
                            'কাজের সময় আপডেট করা যায়নি।',
                          );
                        }
                      }
                    },
                    icon: const Icon(Icons.playlist_add),
                    label: const KLocalizedText('এই পোস্টের সময় যোগ করুন'),
                  ),
                ),
              ],
              const SizedBox(height: KSpacing.md),
              KTextField(
                label: 'প্রস্তাবিত টাকা',
                controller: amount,
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: KSpacing.sm),
              KTextField(label: 'বার্তা (ঐচ্ছিক)', controller: message),
              if (submitError case final error?) ...[
                const SizedBox(height: KSpacing.sm),
                InlineError(message: error),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const KLocalizedText('ফিরুন'),
          ),
          if (needsIdentity)
            FilledButton(
              key: const ValueKey('apply-verify-identity'),
              onPressed: () {
                Navigator.pop(dialogContext);
                context.push(AppRoutes.verificationCapture('IDENTITY'));
              },
              child: const KLocalizedText('পরিচয় যাচাই করুন'),
            )
          else
            FilledButton(
              onPressed: job.isTimeUnavailable || submitting
                  ? null
                  : () async {
                      final taka = int.tryParse(amount.text);
                      if (taka == null || taka <= 0) {
                        setDialogState(
                          () => submitError = KaajLocalizations.text(
                            dialogContext,
                            'প্রস্তাবিত টাকার পরিমাণ লিখুন।',
                          ),
                        );
                        return;
                      }
                      setDialogState(() {
                        submitting = true;
                        submitError = null;
                      });
                      try {
                        await ref
                            .read(jobsRepositoryProvider)
                            .apply(
                              jobId: job.id,
                              startsAt: start,
                              endsAt: end,
                              proposedPricePoisha: taka * 100,
                              message: message.text,
                            );
                        if (dialogContext.mounted) Navigator.pop(dialogContext);
                        onApplied?.call();
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: KLocalizedText('আবেদন পাঠানো হয়েছে।'),
                            ),
                          );
                        }
                      } on Object catch (error) {
                        if (dialogContext.mounted) {
                          setDialogState(() {
                            submitting = false;
                            needsIdentity = ErrorMapper.from(
                              error,
                            ).needsIdentityVerification;
                            submitError = failureText(
                              dialogContext,
                              error,
                              'আবেদন পাঠানো যায়নি। সময়টি যাচাই করুন।',
                            );
                          });
                        }
                      }
                    },
              child: const KLocalizedText('আবেদন পাঠান'),
            ),
        ],
      ),
    ),
  );
}

Future<bool?> showApplicationRequirements(
  BuildContext context,
  ApplicationEligibility eligibility,
) => showDialog<bool>(
  context: context,
  builder: (dialogContext) {
    final pending = eligibility.identityStatus == 'PENDING';
    final rejected = eligibility.identityStatus == 'REJECTED';
    return AlertDialog(
      title: const KLocalizedText('আবেদনের আগে পরিচয় যাচাই করুন'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            KLocalizedText(
              pending
                  ? 'আপনার NID ও সেলফি পর্যালোচনাধীন। অনুমোদন হলে আবেদন করতে পারবেন।'
                  : rejected
                  ? 'আগের যাচাই অনুমোদিত হয়নি। পরিষ্কার NID ও নতুন সেলফি দিয়ে আবার জমা দিন।'
                  : 'নিরাপদে কাজ পেতে নিচের আবশ্যিক তথ্য যাচাই সম্পন্ন করুন।',
            ),
            const SizedBox(height: KSpacing.md),
            EligibilityRow(
              label: 'ফোন নম্বর',
              verified: eligibility.phoneVerified,
            ),
            EligibilityRow(
              label: 'পরিচয় তথ্য',
              verified: eligibility.identityInformationVerified,
            ),
            EligibilityRow(
              label: 'জাতীয় পরিচয়পত্র (NID)',
              verified: eligibility.nidVerified,
            ),
            EligibilityRow(
              label: 'সেলফি',
              verified: eligibility.selfieVerified,
            ),
            const Divider(height: KSpacing.lg),
            const EligibilityRow(label: 'অভিজ্ঞতা', optional: true),
            const EligibilityRow(label: 'দক্ষতা / বিশেষজ্ঞতা', optional: true),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const KLocalizedText('পরে'),
        ),
        if (!pending)
          FilledButton.icon(
            onPressed: () => Navigator.pop(dialogContext, true),
            icon: const Icon(Icons.verified_user_outlined),
            label: KLocalizedText(
              rejected ? 'আবার যাচাই করুন' : 'যাচাই শুরু করুন',
            ),
          ),
      ],
    );
  },
);

class EligibilityRow extends StatelessWidget {
  const EligibilityRow({
    super.key,
    required this.label,
    this.verified = false,
    this.optional = false,
  });

  final String label;
  final bool verified;
  final bool optional;

  @override
  Widget build(BuildContext context) => ListTile(
    dense: true,
    contentPadding: EdgeInsets.zero,
    leading: Icon(
      optional
          ? Icons.add_circle_outline
          : verified
          ? Icons.check_circle
          : Icons.radio_button_unchecked,
      color: optional
          ? KColors.primary
          : verified
          ? KColors.success
          : KColors.warning,
    ),
    title: KLocalizedText(label),
    trailing: KLocalizedText(
      optional
          ? 'ঐচ্ছিক'
          : verified
          ? 'সম্পন্ন'
          : 'আবশ্যিক',
    ),
  );
}

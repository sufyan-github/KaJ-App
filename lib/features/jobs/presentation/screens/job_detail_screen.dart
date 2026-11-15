import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_card.dart';
import '../../../../core/widgets/k_error_state.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../onboarding/domain/onboarding_state.dart';
import '../../../profile/presentation/controllers/me_provider.dart';
import '../../domain/job_models.dart';
import '../controllers/jobs_providers.dart';
import 'jobs_screens.dart';

class JobDetailScreen extends ConsumerWidget {
  const JobDetailScreen({required this.jobId, super.key});

  final String jobId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(jobDetailProvider(jobId));
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('কাজের বিবরণ')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: KErrorState(
            failure: ErrorMapper.from(error),
            retryLabel: 'আবার চেষ্টা করুন',
            onRetry: () => ref.invalidate(jobDetailProvider(jobId)),
          ),
        ),
        data: (value) => _JobDetailBody(detail: value),
      ),
    );
  }
}

class _JobDetailBody extends ConsumerWidget {
  const _JobDetailBody({required this.detail});

  final JobDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final job = detail.job;
    final language = Localizations.localeOf(context).languageCode;
    final isWorker = ref.watch(meRoleProvider) == KaajRole.worker;
    final subcategory = detail.subcategoryNameFor(language);
    final skills = job.skillsFor(language);
    final pay = KFormat.moneyRange(
      context,
      job.budgetMinPoisha,
      job.budgetMaxPoisha,
    );
    return ListView(
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        Text(job.title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: KSpacing.xs),
        Align(
          alignment: Alignment.centerLeft,
          child: Chip(
            visualDensity: VisualDensity.compact,
            label: KLocalizedText(jobStatusLabel(job.status)),
          ),
        ),
        const SizedBox(height: KSpacing.sm),
        Text(job.description),
        const SizedBox(height: KSpacing.md),
        KCard(
          child: Column(
            children: [
              _InfoRow(
                icon: Icons.category_outlined,
                label: 'কাজের ধরন',
                value: [
                  job.categoryNameFor(language),
                  ?subcategory,
                ].where((item) => item.isNotEmpty).join(' › '),
              ),
              if (skills.isNotEmpty)
                _InfoRow(
                  icon: Icons.handyman_outlined,
                  label: 'দক্ষতা',
                  value: skills.join(', '),
                ),
              _InfoRow(
                icon: Icons.location_on_outlined,
                label: 'এলাকা',
                value: job.locationNameFor(language),
              ),
              if (job.startsAt != null)
                _InfoRow(
                  icon: Icons.schedule_outlined,
                  label: 'সময়',
                  value: job.endsAt == null
                      ? KFormat.dayAndTime(context, job.startsAt!)
                      : '${KFormat.dayAndTime(context, job.startsAt!)} – ${KFormat.time(context, job.endsAt!)}',
                ),
              if (pay != null)
                _InfoRow(
                  icon: Icons.payments_outlined,
                  label: 'পারিশ্রমিক',
                  value: pay,
                ),
            ],
          ),
        ),
        if (detail.poster case final poster?) _PosterCard(poster: poster),
        const SizedBox(height: KSpacing.md),
        _ActionArea(detail: detail, isWorker: isWorker),
        const SizedBox(height: KSpacing.xl),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: KSpacing.xs),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: KColors.primary),
        const SizedBox(width: KSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              KLocalizedText(
                label,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              Text(value),
            ],
          ),
        ),
      ],
    ),
  );
}

String _trustLabel(String trustLevel) => switch (trustLevel) {
  'IDENTITY' || 'SKILL' || 'BUSINESS' => 'পরিচয় যাচাইকৃত',
  'PHONE' => 'ফোন যাচাইকৃত',
  _ => 'এখনো যাচাই হয়নি',
};

String? _badgeLabel(String slug) => switch (slug) {
  'business-verified' => 'ব্যবসা যাচাইকৃত',
  'new-worker' => 'নতুন',
  'reliable' => 'নির্ভরযোগ্য',
  'top-rated' => 'শীর্ষ রেটিং',
  'experienced' => 'অভিজ্ঞ',
  // "verified" repeats the trust line above, so it is not shown twice.
  _ => null,
};

class _PosterCard extends StatelessWidget {
  const _PosterCard({required this.poster});

  final JobPoster poster;

  @override
  Widget build(BuildContext context) {
    final verified = const {
      'IDENTITY',
      'SKILL',
      'BUSINESS',
    }.contains(poster.trustLevel);
    final badges = poster.badges
        .map(_badgeLabel)
        .whereType<String>()
        .toList(growable: false);
    return KCard(
      key: const ValueKey('job-poster'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          KLocalizedText(
            'পোস্টদাতা',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: KSpacing.xs),
          Row(
            children: [
              const CircleAvatar(child: Icon(Icons.person_outline)),
              const SizedBox(width: KSpacing.sm),
              Expanded(
                child: poster.displayName.trim().isEmpty
                    ? const KLocalizedText('নাম দেওয়া হয়নি')
                    : Text(
                        poster.displayName,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
              ),
            ],
          ),
          const SizedBox(height: KSpacing.sm),
          Wrap(
            spacing: KSpacing.xs,
            runSpacing: KSpacing.xs,
            children: [
              Chip(
                visualDensity: VisualDensity.compact,
                avatar: Icon(
                  verified ? Icons.verified_user_outlined : Icons.info_outline,
                  size: 16,
                  color: verified ? KColors.success : KColors.textSecondary,
                ),
                label: KLocalizedText(_trustLabel(poster.trustLevel)),
              ),
              for (final badge in badges)
                Chip(
                  visualDensity: VisualDensity.compact,
                  label: KLocalizedText(badge),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActionArea extends ConsumerWidget {
  const _ActionArea({required this.detail, required this.isWorker});

  final JobDetail detail;
  final bool isWorker;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (detail.viewerIsPoster) {
      return const _StatusNote(
        icon: Icons.assignment_ind_outlined,
        message: 'এটি আপনার পোস্ট করা কাজ।',
      );
    }
    if (detail.viewerApplicationStatus case final status?) {
      final english = KaajLocalizations.isEnglish(context);
      final label = KaajLocalizations.text(context, jobStatusLabel(status));
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FilledButton.icon(
            key: const ValueKey('job-applied'),
            onPressed: null,
            icon: const Icon(Icons.check_rounded),
            label: const KLocalizedText('আবেদন করা হয়েছে'),
          ),
          const SizedBox(height: KSpacing.xs),
          Text(
            english ? 'Application status: $label' : 'আবেদনের অবস্থা: $label',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      );
    }
    if (!detail.isOpen) {
      return const _StatusNote(
        icon: Icons.lock_clock_outlined,
        message: 'এই কাজে এখন আবেদন নেওয়া হচ্ছে না।',
      );
    }
    if (!isWorker) {
      return const _StatusNote(
        icon: Icons.swap_horiz_outlined,
        message: 'আবেদন করতে সেটিংস থেকে কাজ করব মোড চালু করুন।',
      );
    }
    return FilledButton.icon(
      key: const ValueKey('job-apply'),
      onPressed: () => showJobApplyFlow(
        context,
        ref,
        detail.job,
        onApplied: () => ref.invalidate(jobDetailProvider(detail.job.id)),
      ),
      icon: const Icon(Icons.send_outlined),
      label: const KLocalizedText('আবেদন করুন'),
    );
  }
}

class _StatusNote extends StatelessWidget {
  const _StatusNote({required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, color: KColors.textSecondary),
      const SizedBox(width: KSpacing.sm),
      Expanded(child: KLocalizedText(message)),
    ],
  );
}

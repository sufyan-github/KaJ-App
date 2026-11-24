// The pieces of the home hub: search, quick numbers, the six parts of KAAJ,
// what is coming up, jobs for the person, and a small grid of shortcuts.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../community/community_routes.dart';
import '../../../community/domain/community_models.dart';
import '../../../community/presentation/community_providers.dart';
import '../../../jobs/domain/job_models.dart';
import '../../../jobs/presentation/controllers/jobs_providers.dart';
import '../../../training/presentation/training_providers.dart';

/// The home feed asks for the same jobs as the "for you" list.
const homeJobFilter = JobFeedFilter();

const _finishedAssignmentStatuses = {
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
  'DECLINED',
};

bool _isActive(AssignmentSummary item) =>
    !_finishedAssignmentStatuses.contains(item.status);

/// One wide search field that opens the right list for the role.
class HomeSearchBar extends StatelessWidget {
  const HomeSearchBar({required this.label, required this.onTap, super.key});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    child: Material(
      color: KColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(KRadius.pill),
        side: const BorderSide(color: KColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
          child: Row(
            children: [
              const Icon(Icons.search_rounded, color: KColors.primary),
              const SizedBox(width: 12),
              Expanded(
                child: KLocalizedText(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.bodyLarge?.copyWith(color: KColors.textSecondary),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

/// Three small numbers about the person's own activity. A number that the
/// server could not give shows a dash instead of a wrong zero.
class HomeStatsRow extends ConsumerWidget {
  const HomeStatsRow({
    required this.isWorker,
    required this.unreadNotifications,
    super.key,
  });

  final bool isWorker;
  final int unreadNotifications;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeWork = ref
        .watch(assignmentsProvider)
        .maybeWhen(
          data: (items) => items.where(_isActive).length,
          orElse: () => null,
        );
    final stats = <({String label, int? value, String route})>[
      if (isWorker) ...[
        (label: 'চলমান কাজ', value: activeWork, route: AppRoutes.assignments),
        (
          label: 'সামনের সেশন',
          value: ref
              .watch(sessionsProvider('attending'))
              .maybeWhen(
                data: (items) => items.where(_isUpcomingSession).length,
                orElse: () => null,
              ),
          route: CommunityPaths.sessions,
        ),
        (
          label: 'সার্টিফিকেট',
          value: ref
              .watch(myCertificatesProvider)
              .maybeWhen(
                data: (items) => items.where((item) => item.isValid).length,
                orElse: () => null,
              ),
          route: AppRoutes.trainingCertificates,
        ),
      ] else ...[
        (
          label: 'আপনার পোস্ট',
          value: ref
              .watch(myJobsProvider)
              .maybeWhen(data: (items) => items.length, orElse: () => null),
          route: AppRoutes.jobs,
        ),
        (label: 'চলমান কাজ', value: activeWork, route: AppRoutes.assignments),
        (
          label: 'নতুন আপডেট',
          value: unreadNotifications,
          route: AppRoutes.notifications,
        ),
      ],
    ];
    return Row(
      children: [
        for (final (index, stat) in stats.indexed) ...[
          if (index > 0) const SizedBox(width: KSpacing.sm),
          Expanded(
            child: _StatTile(
              label: stat.label,
              value: stat.value,
              onTap: () => context.push(stat.route),
            ),
          ),
        ],
      ],
    );
  }
}

bool _isUpcomingSession(CommunitySession session) {
  final startsAt = session.startsAt;
  return session.isOpen && startsAt != null && startsAt.isAfter(DateTime.now());
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;
  final int? value;

  @override
  Widget build(BuildContext context) {
    final shown = value == null ? '—' : KFormat.count(context, value!);
    return Material(
      color: KColors.surfaceAlt,
      borderRadius: BorderRadius.circular(KRadius.md),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
          child: Column(
            children: [
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                child: Text(
                  shown,
                  key: ValueKey(shown),
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: KColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 2),
              KLocalizedText(
                label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The six parts of KAAJ, each opening its own section of Explore. The
/// labels and icons are the same as the Explore chips.
class HomePillarGrid extends StatelessWidget {
  const HomePillarGrid({super.key});

  static const _pillars = <({String section, IconData icon, String label})>[
    (section: 'work', icon: Icons.work_outline, label: 'কাজের সুযোগ'),
    (section: 'learn', icon: Icons.school_outlined, label: 'শেখা'),
    (
      section: 'business',
      icon: Icons.storefront_outlined,
      label: 'ব্যবসা-বাণিজ্য',
    ),
    (section: 'ideas', icon: Icons.lightbulb_outline, label: 'আইডিয়া'),
    (section: 'community', icon: Icons.diversity_3_outlined, label: 'কমিউনিটি'),
    (section: 'people', icon: Icons.groups_outlined, label: 'মানুষ'),
  ];

  @override
  Widget build(BuildContext context) => _TileGrid(
    minTileWidth: 104,
    maxColumns: 3,
    children: [
      for (final pillar in _pillars)
        _IconTile(
          key: ValueKey('home-pillar-${pillar.section}'),
          icon: pillar.icon,
          label: pillar.label,
          filled: true,
          onTap: () =>
              context.push('${AppRoutes.explore}?section=${pillar.section}'),
        ),
    ],
  );
}

/// Lays tiles out in equal columns without fixing their height, so large
/// text makes a tile taller instead of clipping it.
class _TileGrid extends StatelessWidget {
  const _TileGrid({
    required this.children,
    required this.minTileWidth,
    required this.maxColumns,
  });

  final List<Widget> children;
  final int maxColumns;
  final double minTileWidth;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final scale = MediaQuery.textScalerOf(context).scale(16) / 16;
      final wanted = (constraints.maxWidth / (minTileWidth * scale)).floor();
      final columns = wanted.clamp(2, maxColumns);
      final rows = <Widget>[];
      for (var start = 0; start < children.length; start += columns) {
        final end = (start + columns).clamp(0, children.length);
        rows.add(
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var index = start; index < start + columns; index++) ...[
                  if (index > start) const SizedBox(width: KSpacing.sm),
                  Expanded(
                    child: index < end
                        ? children[index]
                        : const SizedBox.shrink(),
                  ),
                ],
              ],
            ),
          ),
        );
      }
      return Column(
        children: [
          for (final (index, row) in rows.indexed) ...[
            if (index > 0) const SizedBox(height: KSpacing.sm),
            row,
          ],
        ],
      );
    },
  );
}

class _IconTile extends StatelessWidget {
  const _IconTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.filled = false,
    super.key,
  });

  final bool filled;
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    child: Material(
      color: filled ? KColors.surface : Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(KRadius.md),
        side: filled
            ? const BorderSide(color: KColors.border)
            : BorderSide.none,
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: 6,
            vertical: filled ? 14 : 10,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircleAvatar(
                radius: filled ? 20 : 18,
                backgroundColor: KColors.surfaceAlt,
                foregroundColor: KColors.primary,
                child: Icon(icon, size: filled ? 22 : 20),
              ),
              const SizedBox(height: 6),
              KLocalizedText(
                label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: filled
                    ? Theme.of(context).textTheme.labelLarge
                    : Theme.of(context).textTheme.labelMedium,
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

/// The next booked job and the next session, when there is one.
class HomeComingUp extends ConsumerWidget {
  const HomeComingUp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = DateTime.now();
    final assignments = [...?ref.watch(assignmentsProvider).valueOrNull].where((
      item,
    ) {
      final startsAt = item.startsAt;
      return _isActive(item) && startsAt != null && startsAt.isAfter(now);
    }).toList()..sort((a, b) => a.startsAt!.compareTo(b.startsAt!));
    final sessions =
        [
            ...?ref.watch(sessionsProvider('attending')).valueOrNull,
          ].where(_isUpcomingSession).toList()
          ..sort((a, b) => a.startsAt!.compareTo(b.startsAt!));
    if (assignments.isEmpty && sessions.isEmpty) {
      return const SizedBox.shrink();
    }
    return Column(
      key: const ValueKey('home-coming-up'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: KSpacing.md),
        KLocalizedText(
          'সামনে যা আছে',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: KSpacing.sm),
        if (assignments.isNotEmpty)
          _ComingUpRow(
            icon: Icons.event_available_outlined,
            title: assignments.first.title,
            when: assignments.first.startsAt!,
            onTap: () =>
                context.push(AppRoutes.assignmentDetail(assignments.first.id)),
          ),
        if (assignments.isNotEmpty && sessions.isNotEmpty)
          const SizedBox(height: KSpacing.sm),
        if (sessions.isNotEmpty)
          _ComingUpRow(
            icon: Icons.groups_2_outlined,
            title: sessions.first.title,
            when: sessions.first.startsAt!,
            onTap: () =>
                context.push(CommunityPaths.session(sessions.first.id)),
          ),
      ],
    );
  }
}

class _ComingUpRow extends StatelessWidget {
  const _ComingUpRow({
    required this.icon,
    required this.title,
    required this.when,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;
  final String title;
  final DateTime when;

  @override
  Widget build(BuildContext context) => Material(
    color: KColors.surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(KRadius.md),
      side: const BorderSide(color: KColors.border),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Icon(icon, color: KColors.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Written by a person, so it is shown as written.
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  Text(
                    KFormat.dayAndTime(context, when),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.chevron_right_rounded,
              color: KColors.textSecondary,
            ),
          ],
        ),
      ),
    ),
  );
}

/// Up to three real jobs from the person's own feed, with the two filters
/// the old home had as chips.
class HomeJobsForYou extends ConsumerWidget {
  const HomeJobsForYou({required this.nearYouRoute, super.key});

  final String nearYouRoute;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(jobFeedProvider(homeJobFilter));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: KLocalizedText(
                'আপনার জন্য কাজ',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            TextButton(
              onPressed: () => context.push(AppRoutes.jobs),
              child: const KLocalizedText('সব দেখুন'),
            ),
          ],
        ),
        Wrap(
          spacing: KSpacing.sm,
          runSpacing: KSpacing.xs,
          children: [
            ActionChip(
              avatar: const Icon(Icons.location_on_outlined, size: 18),
              label: const KLocalizedText('আপনার এলাকায়'),
              onPressed: () => context.push(nearYouRoute),
            ),
            ActionChip(
              avatar: const Icon(Icons.schedule_rounded, size: 18),
              label: const KLocalizedText('আপনার সময়ে মেলা কাজ'),
              onPressed: () => context.push(AppRoutes.jobsMatchingTime),
            ),
          ],
        ),
        const SizedBox(height: KSpacing.sm),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          child: feed.when(
            skipLoadingOnRefresh: true,
            loading: () => const _JobPlaceholders(key: ValueKey('loading')),
            error: (_, _) => _FeedMessage(
              key: const ValueKey('error'),
              message: 'কাজের তালিকা আনা যায়নি।',
              actionLabel: 'আবার চেষ্টা করুন',
              onAction: () => ref.invalidate(jobFeedProvider(homeJobFilter)),
            ),
            data: (jobs) => jobs.isEmpty
                ? _FeedMessage(
                    key: const ValueKey('empty'),
                    message: 'এখন আপনার সাথে মেলে এমন কাজ নেই।',
                    actionLabel: 'সব কাজ দেখুন',
                    onAction: () =>
                        context.push('${AppRoutes.explore}?section=work'),
                  )
                : Column(
                    key: const ValueKey('jobs'),
                    children: [
                      for (final (index, job) in jobs.take(3).indexed) ...[
                        if (index > 0) const SizedBox(height: KSpacing.sm),
                        _HomeJobCard(job: job),
                      ],
                    ],
                  ),
          ),
        ),
      ],
    );
  }
}

class _HomeJobCard extends StatelessWidget {
  const _HomeJobCard({required this.job});

  final JobSummary job;

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final startsAt = job.startsAt;
    final place = job.locationNameFor(language);
    final meta = [
      if (place.trim().isNotEmpty) place,
      if (startsAt != null) KFormat.dayAndTime(context, startsAt),
    ].join(' · ');
    final budget = KFormat.moneyRange(
      context,
      job.budgetMinPoisha,
      job.budgetMaxPoisha,
    );
    final score = job.matchScore;
    return Material(
      key: ValueKey('home-job-${job.id}'),
      color: KColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(KRadius.md),
        side: const BorderSide(color: KColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push(AppRoutes.jobDetail(job.id)),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Written by the poster, so it is shown as written.
                    Text(
                      job.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    if (meta.isNotEmpty)
                      Text(
                        meta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    if (budget != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        budget,
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          color: KColors.primary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (score != null) ...[
                const SizedBox(width: KSpacing.sm),
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: KColors.surfaceAlt,
                    borderRadius: BorderRadius.circular(KRadius.pill),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    child: Text(
                      '${KFormat.count(context, score)}%',
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                  ),
                ),
              ],
              const Icon(
                Icons.chevron_right_rounded,
                color: KColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Still boxes while the first page loads: nothing spins, so the screen
/// settles as soon as the answer arrives.
class _JobPlaceholders extends StatelessWidget {
  const _JobPlaceholders({super.key});

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: Column(
      children: [
        for (var index = 0; index < 2; index++) ...[
          if (index > 0) const SizedBox(height: KSpacing.sm),
          Container(
            height: 68,
            decoration: BoxDecoration(
              color: KColors.surface,
              borderRadius: BorderRadius.circular(KRadius.md),
              border: Border.all(color: KColors.border),
            ),
          ),
        ],
      ],
    ),
  );
}

class _FeedMessage extends StatelessWidget {
  const _FeedMessage({
    required this.message,
    required this.actionLabel,
    required this.onAction,
    super.key,
  });

  final String actionLabel;
  final String message;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(12, 10, 12, 2),
    decoration: BoxDecoration(
      color: KColors.surface,
      borderRadius: BorderRadius.circular(KRadius.md),
      border: Border.all(color: KColors.border),
    ),
    // Stacked, so the button never squeezes the sentence at large text.
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        KLocalizedText(message, style: Theme.of(context).textTheme.bodyMedium),
        TextButton(
          onPressed: onAction,
          style: TextButton.styleFrom(padding: EdgeInsets.zero),
          child: KLocalizedText(actionLabel),
        ),
      ],
    ),
  );
}

/// The screens that have no place in the bottom bar, Explore or Settings,
/// as a small grid instead of a page of large tiles.
class HomeShortcuts extends StatelessWidget {
  const HomeShortcuts({required this.isWorker, super.key});

  final bool isWorker;

  @override
  Widget build(BuildContext context) {
    final items = <({IconData icon, String label, String route})>[
      if (isWorker) ...[
        (
          icon: Icons.event_available_outlined,
          label: 'বুকিং ও কাজ',
          route: AppRoutes.assignments,
        ),
        (
          icon: Icons.calendar_month_outlined,
          label: 'কাজের সময়',
          route: AppRoutes.editAvailability,
        ),
        (
          icon: Icons.handyman_outlined,
          label: 'দক্ষতা',
          route: AppRoutes.editWorkerSkills,
        ),
        (
          icon: Icons.notifications_active_outlined,
          label: 'কাজের সতর্কতা',
          route: AppRoutes.jobAlerts,
        ),
        (
          icon: Icons.reviews_outlined,
          label: 'রিভিউ',
          route: AppRoutes.reviews,
        ),
        (
          icon: Icons.photo_library_outlined,
          label: 'পোর্টফোলিও',
          route: AppRoutes.portfolio,
        ),
        (
          icon: Icons.person_search_outlined,
          label: 'পাবলিক প্রোফাইল',
          route: AppRoutes.publicWorkerProfile,
        ),
      ] else ...[
        (
          icon: Icons.people_alt_outlined,
          label: 'কর্মী খুঁজুন',
          route: AppRoutes.workers,
        ),
        (
          icon: Icons.favorite_border,
          label: 'পছন্দের কর্মী',
          route: AppRoutes.favorites,
        ),
        (
          icon: Icons.assignment_outlined,
          label: 'আমার পোস্ট',
          route: AppRoutes.jobs,
        ),
        (
          icon: Icons.event_available_outlined,
          label: 'বুকিং ও কাজ',
          route: AppRoutes.assignments,
        ),
        (
          icon: Icons.category_outlined,
          label: 'কাজের ধরন',
          route: AppRoutes.categories,
        ),
        (
          icon: Icons.reviews_outlined,
          label: 'রিভিউ',
          route: AppRoutes.reviews,
        ),
        (icon: Icons.gavel_outlined, label: 'বিরোধ', route: AppRoutes.disputes),
      ],
      (
        icon: Icons.help_outline_rounded,
        label: 'সহায়তা কেন্দ্র',
        route: AppRoutes.help,
      ),
    ];
    return _TileGrid(
      minTileWidth: 84,
      maxColumns: 4,
      children: [
        for (final item in items)
          _IconTile(
            key: ValueKey('home-shortcut-${item.route}'),
            icon: item.icon,
            label: item.label,
            onTap: () => context.push(item.route),
          ),
      ],
    );
  }
}

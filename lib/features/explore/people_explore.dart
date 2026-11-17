import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/formatting/kaaj_format.dart';
import '../../core/localization/kaaj_localizations.dart';
import '../../core/routing/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/k_empty_state.dart';
import '../../core/widgets/k_localized_text.dart';
import '../jobs/presentation/screens/jobs_screens.dart';
import '../jobs/presentation/widgets/opportunity_listing.dart';
import '../mentor/domain/mentor_models.dart';
import '../mentor/presentation/mentor_providers.dart';

/// Explore → People: workers to book and mentors to learn from.
class PeopleExploreBody extends StatefulWidget {
  const PeopleExploreBody({this.searchQuery = '', super.key});

  final String searchQuery;

  @override
  State<PeopleExploreBody> createState() => _PeopleExploreBodyState();
}

class _PeopleExploreBodyState extends State<PeopleExploreBody> {
  int _part = 0;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(
          KSpacing.md,
          KSpacing.sm,
          KSpacing.md,
          0,
        ),
        child: SegmentedButton<int>(
          showSelectedIcon: false,
          segments: const [
            ButtonSegment(
              value: 0,
              icon: Icon(Icons.handyman_outlined),
              label: KLocalizedText('কর্মী'),
            ),
            ButtonSegment(
              value: 1,
              icon: Icon(Icons.school_outlined),
              label: KLocalizedText('মেন্টর'),
            ),
          ],
          selected: {_part},
          onSelectionChanged: (value) => setState(() => _part = value.first),
        ),
      ),
      Expanded(
        child: _part == 0
            ? WorkerDirectoryScreen(
                embedded: true,
                searchQuery: widget.searchQuery,
              )
            : MentorDirectory(searchQuery: widget.searchQuery),
      ),
    ],
  );
}

class MentorDirectory extends ConsumerWidget {
  const MentorDirectory({this.searchQuery = '', super.key});

  final String searchQuery;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mentors = ref.watch(mentorDirectoryProvider);
    return mentors.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => RetryPanel(
        error: error,
        label: 'মেন্টরের তালিকা লোড করা যায়নি।',
        onRetry: () => ref.invalidate(mentorDirectoryProvider),
      ),
      data: (all) {
        final items = all
            .where(
              (mentor) => matchesSearch(searchQuery, [
                mentor.displayName,
                mentor.bio,
                mentor.areaNameBn,
                mentor.areaNameEn,
                for (final skill in mentor.skills) ...[
                  skill.nameBn,
                  skill.nameEn,
                ],
              ]),
            )
            .toList(growable: false);
        if (items.isEmpty && all.isNotEmpty) return const NoSearchMatches();
        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(mentorDirectoryProvider);
            await ref
                .read(mentorDirectoryProvider.future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: items.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: const [
                    SizedBox(height: KSpacing.xl),
                    KEmptyState(
                      icon: Icons.school_outlined,
                      title: 'এখনো কোনো মেন্টর নেই',
                      message:
                          'অনুমোদিত মেন্টররা শিক্ষার্থী নিলে এখানে দেখা যাবে।',
                    ),
                  ],
                )
              : ListView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(KSpacing.md),
                  itemCount: items.length,
                  itemBuilder: (context, index) =>
                      _MentorCard(mentor: items[index]),
                ),
        );
      },
    );
  }
}

class _MentorCard extends StatelessWidget {
  const _MentorCard({required this.mentor});

  final PublicMentor mentor;

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final theme = Theme.of(context);
    return Card(
      key: ValueKey('mentor-${mentor.id}'),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const CircleAvatar(child: Icon(Icons.person_outline)),
                const SizedBox(width: KSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        mentor.displayName,
                        style: theme.textTheme.titleMedium,
                      ),
                      Text(
                        [
                          KaajLocalizations.text(context, 'মেন্টর'),
                          if (mentor.yearsExperience != null)
                            '${KFormat.count(context, mentor.yearsExperience!)} '
                                '${KaajLocalizations.text(context, 'বছরের অভিজ্ঞতা')}',
                          if (mentor.areaFor(language).isNotEmpty)
                            mentor.areaFor(language),
                        ].join(' · '),
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (mentor.skills.isNotEmpty) ...[
              const SizedBox(height: KSpacing.xs),
              Wrap(
                spacing: KSpacing.xs,
                children: [
                  for (final skill in mentor.skills)
                    Chip(
                      visualDensity: VisualDensity.compact,
                      label: Text(skill.nameFor(language)),
                    ),
                ],
              ),
            ],
            if (mentor.bio?.isNotEmpty ?? false)
              Text(mentor.bio!, maxLines: 3, overflow: TextOverflow.ellipsis),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => context.push(AppRoutes.exploreLearn),
                child: const KLocalizedText('শেখার সুযোগ দেখুন'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

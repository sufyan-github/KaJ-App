import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import '../../training/presentation/screens/training_catalog_screen.dart';
import '../domain/learning_models.dart';
import 'learning_providers.dart';
import 'learning_widgets.dart';

/// Explore → Learn: learning with a mentor (trainings and apprenticeships)
/// and online courses.
class LearnExploreBody extends StatefulWidget {
  const LearnExploreBody({this.searchQuery = '', super.key});

  final String searchQuery;

  @override
  State<LearnExploreBody> createState() => _LearnExploreBodyState();
}

class _LearnExploreBodyState extends State<LearnExploreBody> {
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
              icon: Icon(Icons.groups_outlined),
              label: KLocalizedText('মেন্টরের সাথে'),
            ),
            ButtonSegment(
              value: 1,
              icon: Icon(Icons.play_circle_outline),
              label: KLocalizedText('অনলাইন কোর্স'),
            ),
          ],
          selected: {_part},
          onSelectionChanged: (value) => setState(() => _part = value.first),
        ),
      ),
      Expanded(
        child: _part == 0
            ? LearningOpportunityList(searchQuery: widget.searchQuery)
            : TrainingCatalogScreen(
                embedded: true,
                searchQuery: widget.searchQuery,
              ),
      ),
    ],
  );
}

class LearningOpportunityList extends ConsumerStatefulWidget {
  const LearningOpportunityList({this.searchQuery = '', super.key});

  final String searchQuery;

  @override
  ConsumerState<LearningOpportunityList> createState() =>
      _LearningOpportunityListState();
}

class _LearningOpportunityListState
    extends ConsumerState<LearningOpportunityList> {
  LearningKind? _kind;
  ParticipantTerms? _terms;
  DeliveryMode? _mode;

  @override
  Widget build(BuildContext context) {
    final filter = LearningFilter(kind: _kind, terms: _terms, mode: _mode);
    final feed = ref.watch(learningFeedProvider(filter));
    return Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(
            horizontal: KSpacing.md,
            vertical: KSpacing.sm,
          ),
          child: Row(
            children: [
              for (final kind in LearningKind.values)
                _Filter(
                  key: ValueKey('learn-kind-${kind.wire}'),
                  label: learningKindLabel(kind),
                  selected: _kind == kind,
                  onSelected: (on) => setState(() => _kind = on ? kind : null),
                ),
              for (final terms in ParticipantTerms.values)
                _Filter(
                  key: ValueKey('learn-terms-${terms.wire}'),
                  label: termsShortLabel(terms),
                  selected: _terms == terms,
                  onSelected: (on) =>
                      setState(() => _terms = on ? terms : null),
                ),
              for (final mode in DeliveryMode.values)
                _Filter(
                  key: ValueKey('learn-mode-${mode.wire}'),
                  label: deliveryModeLabel(mode),
                  selected: _mode == mode,
                  onSelected: (on) => setState(() => _mode = on ? mode : null),
                ),
            ],
          ),
        ),
        Expanded(
          child: feed.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => RetryPanel(
              error: error,
              label: 'শেখার সুযোগ লোড করা যায়নি।',
              onRetry: () => ref.invalidate(learningFeedProvider(filter)),
            ),
            data: (all) {
              final language = Localizations.localeOf(context).languageCode;
              final items = all
                  .where(
                    (item) => matchesSearch(widget.searchQuery, [
                      item.title,
                      item.description,
                      item.categoryFor(language),
                      item.areaNameBn,
                      item.areaNameEn,
                      for (final skill in item.skillNames) ...[
                        skill.bn,
                        skill.en,
                      ],
                      item.mentor?.displayName,
                    ]),
                  )
                  .toList(growable: false);
              if (items.isEmpty && all.isNotEmpty) {
                return const NoSearchMatches();
              }
              return RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(learningFeedProvider(filter));
                  await ref
                      .read(learningFeedProvider(filter).future)
                      .then<void>((_) {}, onError: (_) {});
                },
                child: items.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: const [
                          SizedBox(height: KSpacing.xl),
                          KEmptyState(
                            icon: Icons.school_outlined,
                            title: 'এখনো কোনো শেখার সুযোগ নেই',
                            message:
                                'মেন্টররা প্রশিক্ষণ বা শিক্ষানবিশি প্রকাশ করলে এখানে দেখা যাবে।',
                          ),
                        ],
                      )
                    : ListView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.symmetric(
                          horizontal: KSpacing.md,
                        ),
                        itemCount: items.length,
                        itemBuilder: (context, index) =>
                            LearningOpportunityCard(opportunity: items[index]),
                      ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _Filter extends StatelessWidget {
  const _Filter({
    required this.label,
    required this.selected,
    required this.onSelected,
    super.key,
  });

  final String label;
  final bool selected;
  final ValueChanged<bool> onSelected;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: KSpacing.xs),
    child: FilterChip(
      label: KLocalizedText(label),
      selected: selected,
      onSelected: onSelected,
    ),
  );
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/load_more.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import '../../profile/presentation/controllers/me_provider.dart';
import '../domain/idea_models.dart';
import '../idea_routes.dart';
import 'idea_providers.dart';
import 'idea_widgets.dart';

/// Explore, Ideas: public idea cards. The search box of Explore is sent to
/// the server (title and summary) once it has two characters.
class IdeasExploreBody extends ConsumerStatefulWidget {
  const IdeasExploreBody({this.searchQuery = '', super.key});

  final String searchQuery;

  @override
  ConsumerState<IdeasExploreBody> createState() => _IdeasExploreBodyState();
}

class _IdeasExploreBodyState extends ConsumerState<IdeasExploreBody> {
  String? _categoryId;
  String? _locationId;
  String? _stage;
  String? _roleType;
  late String? _q = _searchFrom(widget.searchQuery);
  Timer? _debounce;
  final _more = MorePages<Idea>();

  static String? _searchFrom(String text) {
    final value = text.trim();
    return value.length >= 2 ? value : null;
  }

  @override
  void didUpdateWidget(IdeasExploreBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.searchQuery == widget.searchQuery) return;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      final next = _searchFrom(widget.searchQuery);
      if (mounted && next != _q) setState(() => _q = next);
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  IdeaFilter get _filter => (
    categoryId: _categoryId,
    locationId: _locationId,
    stage: _stage,
    roleType: _roleType,
    q: _q,
  );

  @override
  Widget build(BuildContext context) {
    final filter = _filter;
    final feed = ref.watch(ideaSearchProvider(filter));
    final language = Localizations.localeOf(context).languageCode;
    final area = ref.watch(meProvider).valueOrNull?.areaId;
    final sectors = ref.watch(ideaSectorsProvider).valueOrNull ?? const [];
    String? sectorName() {
      for (final sector in sectors) {
        if (sector.id == _categoryId) return sector.nameFor(language);
      }
      return null;
    }

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
              if (area != null)
                Padding(
                  padding: const EdgeInsets.only(right: KSpacing.xs),
                  child: FilterChip(
                    key: const ValueKey('ideas-near-me'),
                    avatar: const Icon(Icons.near_me_outlined, size: 18),
                    label: const KLocalizedText('আমার এলাকায়'),
                    selected: _locationId == area,
                    onSelected: (on) =>
                        setState(() => _locationId = on ? area : null),
                  ),
                ),
              _ChoiceFilter(
                key: const ValueKey('ideas-filter-sector'),
                label: 'আইডিয়ার খাত',
                valueText: sectorName(),
                options: [
                  for (final sector in sectors)
                    (sector.id, sector.nameFor(language), false),
                ],
                selected: _categoryId,
                onChanged: (value) => setState(() => _categoryId = value),
              ),
              _ChoiceFilter(
                key: const ValueKey('ideas-filter-stage'),
                label: 'আইডিয়ার পর্যায়',
                valueText: _stage == null
                    ? null
                    : KaajLocalizations.text(context, ideaStageLabel(_stage!)),
                options: [
                  for (final stage in IdeaStages.open)
                    (stage, ideaStageLabel(stage), true),
                ],
                selected: _stage,
                onChanged: (value) => setState(() => _stage = value),
              ),
              _ChoiceFilter(
                key: const ValueKey('ideas-filter-role'),
                label: 'যে ভূমিকা খোঁজা হচ্ছে',
                valueText: _roleType == null
                    ? null
                    : KaajLocalizations.text(
                        context,
                        ideaRoleTypeLabel(_roleType!),
                      ),
                options: [
                  for (final type in IdeaRoleTypes.all)
                    (type, ideaRoleTypeLabel(type), true),
                ],
                selected: _roleType,
                onChanged: (value) => setState(() => _roleType = value),
              ),
            ],
          ),
        ),
        Expanded(
          child: feed.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => RetryPanel(
              error: error,
              label: 'আইডিয়াগুলো লোড করা যায়নি।',
              onRetry: () => ref.invalidate(ideaSearchProvider(filter)),
            ),
            data: (firstPage) {
              final items = _more.merge(firstPage);
              final hasMore = _more.hasMore;
              return RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(ideaSearchProvider(filter));
                  await ref
                      .read(ideaSearchProvider(filter).future)
                      .then<void>((_) {}, onError: (_) {});
                },
                child: items.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: [
                          const SizedBox(height: KSpacing.lg),
                          KEmptyState(
                            icon: Icons.lightbulb_outline,
                            title: 'কোনো আইডিয়া পাওয়া যায়নি',
                            message:
                                'সারাংশ সবার জন্য খোলা আইডিয়াগুলো এখানে দেখা যাবে। ফিল্টার বদলে দেখুন, অথবা নিজের আইডিয়া লিখুন।',
                            actionLabel: 'নতুন আইডিয়া লিখুন',
                            onAction: () => context.push(IdeaPaths.create),
                          ),
                        ],
                      )
                    : ListView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.symmetric(
                          horizontal: KSpacing.md,
                        ),
                        itemCount: items.length + (hasMore ? 1 : 0),
                        itemBuilder: (context, index) => index < items.length
                            ? IdeaCardTile(idea: items[index])
                            : LoadMoreButton(
                                key: const ValueKey('ideas-load-more'),
                                loading: _more.loading,
                                failed: _more.failed,
                                onPressed: () => _more.loadNext(
                                  (cursor) => ref
                                      .read(ideaRepositoryProvider)
                                      .search(filter, cursor: cursor),
                                  () {
                                    if (mounted) setState(() {});
                                  },
                                ),
                              ),
                      ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// A chip that opens a list of choices; "all" clears it. Each option is
/// (value, label, label is a Bangla catalog key).
class _ChoiceFilter extends StatelessWidget {
  const _ChoiceFilter({
    required this.label,
    required this.options,
    required this.selected,
    required this.onChanged,
    this.valueText,
    super.key,
  });

  final String label;
  final String? valueText;
  final List<(String, String, bool)> options;
  final String? selected;
  final ValueChanged<String?> onChanged;

  Future<void> _open(BuildContext context) async {
    final picked = await showModalBottomSheet<(String?,)>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(
              title: KLocalizedText(
                label,
                style: Theme.of(sheetContext).textTheme.titleMedium,
              ),
            ),
            ListTile(
              key: const ValueKey('ideas-option-all'),
              leading: Icon(
                selected == null
                    ? Icons.radio_button_checked
                    : Icons.radio_button_off,
              ),
              title: const KLocalizedText('সবগুলো দেখান'),
              onTap: () => Navigator.pop(sheetContext, (null,)),
            ),
            for (final (value, text, translate) in options)
              ListTile(
                key: ValueKey('ideas-option-$value'),
                leading: Icon(
                  selected == value
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                ),
                title: translate ? KLocalizedText(text) : Text(text),
                onTap: () => Navigator.pop(sheetContext, (value,)),
              ),
          ],
        ),
      ),
    );
    if (picked != null) onChanged(picked.$1);
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: KSpacing.xs),
    child: FilterChip(
      label: Text(
        valueText == null ? KaajLocalizations.text(context, label) : valueText!,
      ),
      avatar: const Icon(Icons.arrow_drop_down, size: 18),
      selected: selected != null,
      onSelected: (_) => _open(context),
    ),
  );
}

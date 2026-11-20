import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/load_more.dart';
import '../../profile/presentation/controllers/me_provider.dart';
import '../business_routes.dart';
import '../domain/business_models.dart';
import 'business_providers.dart';
import 'business_widgets.dart';

/// Explore, Business: the partner directory (public businesses looking for
/// partners), filtered by sector, stage and area and searched on the
/// server once the search has two letters.
class BusinessExploreBody extends ConsumerStatefulWidget {
  const BusinessExploreBody({this.searchQuery = '', super.key});

  final String searchQuery;

  @override
  ConsumerState<BusinessExploreBody> createState() =>
      _BusinessExploreBodyState();
}

class _BusinessExploreBodyState extends ConsumerState<BusinessExploreBody> {
  static const _debounce = Duration(milliseconds: 400);

  String? _categoryId;
  BusinessStage? _stage;
  String? _locationId;
  late String? _q = _queryFrom(widget.searchQuery);
  Timer? _timer;
  final _more = MorePages<Business>();

  static String? _queryFrom(String text) {
    final query = text.trim();
    if (query.length < 2) return null;
    return query.length > 60 ? query.substring(0, 60) : query;
  }

  @override
  void didUpdateWidget(covariant BusinessExploreBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.searchQuery == widget.searchQuery) return;
    _timer?.cancel();
    _timer = Timer(_debounce, () {
      final next = _queryFrom(widget.searchQuery);
      if (mounted && next != _q) setState(() => _q = next);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  PartnerFilter get _filter => PartnerFilter(
    categoryId: _categoryId,
    stage: _stage,
    locationId: _locationId,
    q: _q,
  );

  Future<void> _pickSector() async {
    final categories = await ref
        .read(businessCategoriesProvider.future)
        .then((value) => value, onError: (_) => const <BusinessRef>[]);
    if (!mounted) return;
    final language = Localizations.localeOf(context).languageCode;
    final picked = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(
              key: const ValueKey('sector-any'),
              title: const KLocalizedText('সব খাত'),
              onTap: () => Navigator.pop(sheetContext, ''),
            ),
            for (final category in categories)
              ListTile(
                key: ValueKey('sector-${category.id}'),
                title: Text(category.nameFor(language)),
                selected: category.id == _categoryId,
                onTap: () => Navigator.pop(sheetContext, category.id),
              ),
          ],
        ),
      ),
    );
    if (picked == null || !mounted) return;
    setState(() => _categoryId = picked.isEmpty ? null : picked);
  }

  @override
  Widget build(BuildContext context) {
    final filter = _filter;
    final page = ref.watch(partnersProvider(filter));
    final area = ref.watch(meProvider).valueOrNull?.areaId;
    final language = Localizations.localeOf(context).languageCode;
    final sectorName = _categoryId == null
        ? null
        : ref
              .watch(businessCategoriesProvider)
              .valueOrNull
              ?.where((item) => item.id == _categoryId)
              .firstOrNull
              ?.nameFor(language);
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
                _Chip(
                  key: const ValueKey('partners-near-me'),
                  icon: Icons.near_me_outlined,
                  label: KaajLocalizations.text(context, 'আমার এলাকায়'),
                  selected: _locationId == area,
                  onSelected: (on) =>
                      setState(() => _locationId = on ? area : null),
                ),
              _Chip(
                key: const ValueKey('partners-sector'),
                icon: Icons.category_outlined,
                label: sectorName ?? KaajLocalizations.text(context, 'খাত'),
                selected: _categoryId != null,
                onSelected: (_) => _pickSector(),
              ),
              for (final stage in BusinessStage.values)
                _Chip(
                  key: ValueKey('partners-stage-${stage.wire}'),
                  label: KaajLocalizations.text(
                    context,
                    businessStageLabel(stage),
                  ),
                  selected: _stage == stage,
                  onSelected: (on) =>
                      setState(() => _stage = on ? stage : null),
                ),
            ],
          ),
        ),
        Expanded(
          child: page.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => BusinessLoadError(
              error: error,
              label: 'অংশীদারদের তালিকা লোড করা যায়নি।',
              onRetry: () => ref.invalidate(partnersProvider(filter)),
            ),
            data: (firstPage) {
              final items = _more.merge(firstPage);
              final hasMore = _more.hasMore;
              return RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(partnersProvider(filter));
                  await ref
                      .read(partnersProvider(filter).future)
                      .then<void>((_) {}, onError: (_) {});
                },
                child: items.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: [
                          const SizedBox(height: KSpacing.xl),
                          KEmptyState(
                            icon: Icons.storefront_outlined,
                            title: 'কোনো ব্যবসা পাওয়া যায়নি',
                            message:
                                'অংশীদার খুঁজছে এমন প্রকাশিত ব্যবসা এখানে দেখা যায়। ফিল্টার বদলে দেখুন, বা নিজের ব্যবসা যোগ করুন।',
                            actionLabel: 'আমার ব্যবসা',
                            onAction: () => context.push(BusinessRoutes.mine),
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
                            ? BusinessCard(
                                business: items[index],
                                onTap: () => context.push(
                                  BusinessRoutes.detail(items[index].id),
                                ),
                              )
                            : LoadMoreButton(
                                key: const ValueKey('partners-load-more'),
                                loading: _more.loading,
                                failed: _more.failed,
                                onPressed: () => _more.loadNext(
                                  (cursor) => ref
                                      .read(businessRepositoryProvider)
                                      .partners(filter, cursor: cursor),
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

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onSelected,
    this.icon,
    super.key,
  });

  final String label;
  final bool selected;
  final ValueChanged<bool> onSelected;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: KSpacing.xs),
    child: FilterChip(
      avatar: icon == null ? null : Icon(icon, size: 18),
      label: Text(label),
      selected: selected,
      onSelected: onSelected,
    ),
  );
}

/// The partner directory on its own page, with a search box.
class PartnersScreen extends StatefulWidget {
  const PartnersScreen({super.key});

  @override
  State<PartnersScreen> createState() => _PartnersScreenState();
}

class _PartnersScreenState extends State<PartnersScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const KLocalizedText('অংশীদার খুঁজুন'),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(64),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            KSpacing.md,
            0,
            KSpacing.md,
            KSpacing.sm,
          ),
          child: TextField(
            key: const ValueKey('partners-search'),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: KaajLocalizations.text(
                context,
                'ব্যবসার নাম বা কাজ লিখুন',
              ),
              prefixIcon: const Icon(Icons.search),
            ),
            onChanged: (value) => setState(() => _query = value),
          ),
        ),
      ),
    ),
    body: BusinessExploreBody(searchQuery: _query),
  );
}

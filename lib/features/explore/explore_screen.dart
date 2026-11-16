import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/kaaj_localizations.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/k_localized_text.dart';
import '../jobs/presentation/screens/jobs_screens.dart';
import '../onboarding/domain/onboarding_state.dart';
import '../profile/presentation/controllers/me_provider.dart';
import '../training/presentation/screens/training_catalog_screen.dart';

/// The kinds of things Explore can show. More (people, experts, ideas,
/// businesses, events) are added as those domains arrive.
enum ExploreSection {
  work,
  learn;

  static ExploreSection parse(String? value) => ExploreSection.values
      .firstWhere((item) => item.name == value, orElse: () => work);
}

/// One place to discover everything: a search box over chips for each kind
/// of opportunity. Replaces the old Search tab.
class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({this.initial = ExploreSection.work, super.key});

  final ExploreSection initial;

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  late ExploreSection _section = widget.initial;
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isWorker = ref.watch(meRoleProvider) == KaajRole.worker;
    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('খুঁজুন ও জানুন'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(116),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              KSpacing.md,
              0,
              KSpacing.md,
              KSpacing.sm,
            ),
            child: Column(
              children: [
                TextField(
                  key: const ValueKey('explore-search'),
                  controller: _search,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: KaajLocalizations.text(
                      context,
                      'কাজ, দক্ষতা, কোর্স বা এলাকা লিখুন',
                    ),
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _query.isEmpty
                        ? null
                        : IconButton(
                            tooltip: KaajLocalizations.text(
                              context,
                              'খোঁজা মুছুন',
                            ),
                            onPressed: () => setState(() {
                              _search.clear();
                              _query = '';
                            }),
                            icon: const Icon(Icons.close),
                          ),
                  ),
                  onChanged: (value) => setState(() => _query = value),
                ),
                const SizedBox(height: KSpacing.sm),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Wrap(
                    spacing: KSpacing.sm,
                    children: [
                      _SectionChip(
                        key: const ValueKey('explore-work'),
                        icon: Icons.work_outline,
                        label: 'কাজের সুযোগ',
                        selected: _section == ExploreSection.work,
                        onSelected: () =>
                            setState(() => _section = ExploreSection.work),
                      ),
                      _SectionChip(
                        key: const ValueKey('explore-learn'),
                        icon: Icons.school_outlined,
                        label: 'শেখা',
                        selected: _section == ExploreSection.learn,
                        onSelected: () =>
                            setState(() => _section = ExploreSection.learn),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: switch (_section) {
        // Work is what the old Search tab showed: open jobs for a worker,
        // workers to book for a client.
        ExploreSection.work =>
          isWorker
              ? JobFeedScreen(embedded: true, searchQuery: _query)
              : WorkerDirectoryScreen(embedded: true, searchQuery: _query),
        ExploreSection.learn => TrainingCatalogScreen(
          embedded: true,
          searchQuery: _query,
        ),
      },
    );
  }
}

class _SectionChip extends StatelessWidget {
  const _SectionChip({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onSelected,
    super.key,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) => ChoiceChip(
    avatar: Icon(icon, size: 18),
    label: KLocalizedText(label),
    selected: selected,
    onSelected: (_) => onSelected(),
  );
}

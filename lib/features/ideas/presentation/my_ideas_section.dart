import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import '../domain/idea_models.dart';
import '../idea_routes.dart';
import 'idea_providers.dart';
import 'idea_widgets.dart';

/// My activity, Ideas: the ideas I own, the teams I am on and the ideas I
/// asked to see.
class MyIdeasSection extends ConsumerWidget {
  const MyIdeasSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mine = ref.watch(myIdeasProvider);
    final access = ref.watch(myIdeaAccessProvider);
    Future<void> refresh() async {
      ref
        ..invalidate(myIdeasProvider)
        ..invalidate(myIdeaAccessProvider);
      await ref
          .read(myIdeasProvider.future)
          .then<void>((_) {}, onError: (_) {});
    }

    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(KSpacing.md),
        children: [
          Wrap(
            spacing: KSpacing.sm,
            runSpacing: KSpacing.sm,
            children: [
              FilledButton.icon(
                key: const ValueKey('ideas-new'),
                style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: () => context.push(IdeaPaths.create),
                icon: const Icon(Icons.add),
                label: const KLocalizedText('নতুন আইডিয়া'),
              ),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: () => context.push('/explore?section=ideas'),
                icon: const Icon(Icons.travel_explore),
                label: const KLocalizedText('অন্যদের আইডিয়া দেখুন'),
              ),
            ],
          ),
          ...mine.when(
            loading: () => const [
              Padding(
                padding: EdgeInsets.all(KSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              ),
            ],
            error: (error, _) => [
              const SizedBox(height: KSpacing.lg),
              RetryPanel(
                error: error,
                label: 'আপনার আইডিয়াগুলো লোড করা যায়নি।',
                onRetry: () => ref.invalidate(myIdeasProvider),
              ),
            ],
            data: (data) => [
              if (data.owned.isEmpty && data.team.isEmpty)
                const KEmptyState(
                  icon: Icons.lightbulb_outline,
                  title: 'এখনো কোনো আইডিয়া নেই',
                  message:
                      'আপনার ব্যবসার আইডিয়া লিখে রাখুন। চাইলে গোপন রাখুন, অথবা সহযোগী খুঁজুন।',
                ),
              if (data.owned.isNotEmpty)
                IdeaSection(
                  title: 'আমার আইডিয়া',
                  children: [
                    for (final idea in data.owned)
                      IdeaCardTile(idea: idea, badges: _ownerBadges(idea)),
                  ],
                ),
              if (data.team.isNotEmpty)
                IdeaSection(
                  title: 'যে আইডিয়ার দলে আছি',
                  children: [
                    for (final idea in data.team) IdeaCardTile(idea: idea),
                  ],
                ),
            ],
          ),
          ...access.when(
            loading: () => const [],
            error: (error, _) => [
              const SizedBox(height: KSpacing.md),
              Text(
                failureText(
                  context,
                  error,
                  'যে আইডিয়াগুলো দেখতে চেয়েছেন, সেগুলো লোড করা যায়নি।',
                ),
              ),
            ],
            data: (items) => [
              if (items.isNotEmpty)
                IdeaSection(
                  title: 'যে আইডিয়াগুলো দেখতে চেয়েছি',
                  children: [for (final item in items) _AccessTile(item: item)],
                ),
            ],
          ),
        ],
      ),
    );
  }

  static List<Widget> _ownerBadges(Idea idea) => [
    IdeaBadge(label: ideaVisibilityLabel(idea.visibility)),
    if (idea.isHidden)
      const IdeaBadge(label: 'মডারেটর লুকিয়েছেন', color: KColors.danger),
    if (idea.isConverted)
      const IdeaBadge(label: 'ব্যবসায় রূপ নিয়েছে', color: KColors.primary),
  ];
}

class _AccessTile extends StatelessWidget {
  const _AccessTile({required this.item});

  final MyIdeaAccess item;

  @override
  Widget build(BuildContext context) => Card(
    key: ValueKey('idea-access-${item.ideaId}'),
    margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
    child: ListTile(
      title: Text(item.title),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (item.summary.isNotEmpty) Text(item.summary),
          KLocalizedText(ideaAccessStatusLabel(item.status)),
          if (item.requestedAt case final at?)
            Text(
              ideaLabelled(context, 'অনুরোধের সময়', KFormat.date(context, at)),
            ),
        ],
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.push(IdeaPaths.detail(item.ideaId)),
    ),
  );
}

/// `/ideas/mine`: the same list as a screen of its own.
class MyIdeasScreen extends StatelessWidget {
  const MyIdeasScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const KLocalizedText('আমার আইডিয়া')),
    body: const MyIdeasSection(),
  );
}

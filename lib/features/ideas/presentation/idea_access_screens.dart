import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/load_more.dart';
import '../domain/idea_models.dart';
import '../idea_routes.dart';
import 'idea_providers.dart';
import 'idea_widgets.dart';

/// `/ideas/:id/access` (the owner, also the notification route): who asked
/// to see the details; approve, decline or revoke.
class IdeaAccessScreen extends ConsumerStatefulWidget {
  const IdeaAccessScreen({required this.ideaId, super.key});

  final String ideaId;

  @override
  ConsumerState<IdeaAccessScreen> createState() => _IdeaAccessScreenState();
}

class _IdeaAccessScreenState extends ConsumerState<IdeaAccessScreen> {
  String? _busyUserId;

  Future<void> _decide(IdeaAccessRequest request, String action) async {
    if (_busyUserId != null) return;
    if (action == 'revoke') {
      final confirmed = await confirmIdeaAction(
        context,
        title: 'অনুমতি তুলে নেবেন?',
        message:
            'এই মানুষটি আর বিস্তারিত দেখতে পারবেন না। চাইলে তিনি আবার অনুরোধ করতে পারবেন।',
        confirmLabel: 'দেখার অনুমতি তুলে নিন',
      );
      if (!confirmed || !mounted) return;
    }
    setState(() => _busyUserId = request.userId);
    try {
      await ref
          .read(ideaRepositoryProvider)
          .decideAccess(widget.ideaId, request.userId, action);
      ref.invalidate(ideaAccessRequestsProvider(widget.ideaId));
    } on Object catch (error) {
      if (mounted) {
        showFailureSnack(context, error, 'সিদ্ধান্তটি সংরক্ষণ করা যায়নি।');
      }
    } finally {
      if (mounted) setState(() => _busyUserId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final id = widget.ideaId;
    final requests = ref.watch(ideaAccessRequestsProvider(id));
    Future<void> refresh() async {
      ref.invalidate(ideaAccessRequestsProvider(id));
      await ref
          .read(ideaAccessRequestsProvider(id).future)
          .then<void>((_) {}, onError: (_) {});
    }

    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('দেখার অনুরোধ ও অনুমতি'),
        actions: [
          IconButton(
            key: const ValueKey('idea-access-views'),
            tooltip: KaajLocalizations.text(
              context,
              'কে কখন বিস্তারিত দেখেছেন',
            ),
            icon: const Icon(Icons.visibility_outlined),
            onPressed: () => context.push(IdeaPaths.views(id)),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: requests.when(
          skipLoadingOnRefresh: true,
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => IdeaLoadError(
            error: error,
            onRetry: () => ref.invalidate(ideaAccessRequestsProvider(id)),
            onOpenIdea: () => context.pushReplacement(IdeaPaths.detail(id)),
          ),
          data: (items) {
            final waiting = items
                .where((item) => item.status == 'REQUESTED')
                .toList(growable: false);
            final approved = items
                .where((item) => item.status == 'APPROVED')
                .toList(growable: false);
            final past = items
                .where(
                  (item) =>
                      item.status != 'REQUESTED' && item.status != 'APPROVED',
                )
                .toList(growable: false);
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(KSpacing.md),
              children: [
                const IdeaStaticNotice(
                  icon: Icons.lock_outline,
                  text:
                      'অনুমতি পাওয়া মানুষ সমস্যা, সমাধান ও বিস্তারিত দেখবেন এবং গোপন রাখতে রাজি হয়েছেন। প্রতিবার দেখা আপনার কাছে লেখা থাকে।',
                ),
                if (items.isEmpty)
                  const KEmptyState(
                    icon: Icons.key_outlined,
                    title: 'এখনো কোনো অনুরোধ নেই',
                    message:
                        'কেউ বিস্তারিত দেখতে চাইলে এখানে দেখবেন এবং নোটিফিকেশন পাবেন।',
                  ),
                if (waiting.isNotEmpty)
                  IdeaSection(
                    title: 'অপেক্ষমাণ দেখার অনুরোধ',
                    children: [for (final item in waiting) _tile(item)],
                  ),
                if (approved.isNotEmpty)
                  IdeaSection(
                    title: 'যাঁরা দেখতে পারেন',
                    children: [for (final item in approved) _tile(item)],
                  ),
                if (past.isNotEmpty)
                  IdeaSection(
                    title: 'আগের দেখার অনুরোধ',
                    children: [for (final item in past) _tile(item)],
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _tile(IdeaAccessRequest item) {
    final busy = _busyUserId == item.userId;
    final requestedAt = item.requestedAt;
    return Card(
      key: ValueKey('idea-access-${item.userId}'),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              item.displayName,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            KLocalizedText(ideaAccessStatusLabel(item.status)),
            if (requestedAt != null)
              Text(
                ideaLabelled(
                  context,
                  'অনুরোধের সময়',
                  KFormat.dateTime(context, requestedAt),
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            if (item.message case final message?)
              Padding(
                padding: const EdgeInsets.only(top: KSpacing.xs),
                child: Text('"$message"'),
              ),
            if (busy)
              const Padding(
                padding: EdgeInsets.only(top: KSpacing.sm),
                child: LinearProgressIndicator(),
              )
            else if (item.status == 'REQUESTED')
              Wrap(
                spacing: KSpacing.sm,
                children: [
                  FilledButton(
                    key: ValueKey('idea-approve-${item.userId}'),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 44),
                    ),
                    onPressed: () => _decide(item, 'approve'),
                    child: const KLocalizedText('দেখার অনুমতি দিন'),
                  ),
                  OutlinedButton(
                    key: ValueKey('idea-decline-${item.userId}'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 44),
                    ),
                    onPressed: () => _decide(item, 'decline'),
                    child: const KLocalizedText('অনুরোধ নাকচ করুন'),
                  ),
                ],
              )
            else if (item.status == 'APPROVED')
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  key: ValueKey('idea-revoke-${item.userId}'),
                  onPressed: () => _decide(item, 'revoke'),
                  child: const KLocalizedText('দেখার অনুমতি তুলে নিন'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// `/ideas/:id/views` (the owner): every logged view of the details.
class IdeaViewsScreen extends ConsumerStatefulWidget {
  const IdeaViewsScreen({required this.ideaId, super.key});

  final String ideaId;

  @override
  ConsumerState<IdeaViewsScreen> createState() => _IdeaViewsScreenState();
}

class _IdeaViewsScreenState extends ConsumerState<IdeaViewsScreen> {
  final _more = MorePages<IdeaView>();

  @override
  Widget build(BuildContext context) {
    final id = widget.ideaId;
    final views = ref.watch(ideaViewsProvider(id));
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('কে কখন বিস্তারিত দেখেছেন')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(ideaViewsProvider(id));
          await ref
              .read(ideaViewsProvider(id).future)
              .then<void>((_) {}, onError: (_) {});
        },
        child: views.when(
          skipLoadingOnRefresh: true,
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => IdeaLoadError(
            error: error,
            onRetry: () => ref.invalidate(ideaViewsProvider(id)),
          ),
          data: (firstPage) {
            final items = _more.merge(firstPage);
            if (items.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  KEmptyState(
                    icon: Icons.visibility_outlined,
                    title: 'এখনো কেউ বিস্তারিত দেখেননি',
                    message:
                        'দলের সদস্য বা অনুমতি পাওয়া কেউ বিস্তারিত খুললে এখানে লেখা থাকবে।',
                  ),
                ],
              );
            }
            return ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(KSpacing.md),
              itemCount: items.length + (_more.hasMore ? 1 : 0),
              itemBuilder: (context, index) {
                if (index == items.length) {
                  return LoadMoreButton(
                    key: const ValueKey('idea-views-load-more'),
                    loading: _more.loading,
                    failed: _more.failed,
                    onPressed: () => _more.loadNext(
                      (cursor) => ref
                          .read(ideaRepositoryProvider)
                          .views(id, cursor: cursor),
                      () {
                        if (mounted) setState(() {});
                      },
                    ),
                  );
                }
                final view = items[index];
                final at = view.viewedAt;
                return ListTile(
                  key: ValueKey('idea-view-${view.id}'),
                  leading: const Icon(Icons.visibility_outlined),
                  title: Text(view.displayName),
                  subtitle: Text(
                    [
                      KaajLocalizations.text(
                        context,
                        view.basis == 'MEMBER'
                            ? 'দলের সদস্য হিসেবে'
                            : 'অনুমতি নিয়ে',
                      ),
                      if (at != null) KFormat.dateTime(context, at),
                    ].join(' · '),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

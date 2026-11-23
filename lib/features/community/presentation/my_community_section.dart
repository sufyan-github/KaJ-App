import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import '../community_routes.dart';
import '../domain/community_models.dart';
import 'community_providers.dart';
import 'group_screens.dart';
import 'session_screens.dart';

/// My activity, Community: introductions, sessions and my groups, with
/// counts and ways in.
class MyCommunitySection extends ConsumerWidget {
  const MyCommunitySection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final received = ref.watch(introductionsProvider('received'));
    final sent = ref.watch(introductionsProvider('sent'));
    final attending = ref.watch(sessionsProvider('attending'));
    final hosting = ref.watch(sessionsProvider('hosting'));
    final groups = ref.watch(myGroupsProvider);

    String count(int value) => KFormat.count(context, value);
    String line(List<(String, int)> parts) => parts
        .map(
          (part) =>
              '${KaajLocalizations.text(context, part.$1)}: ${count(part.$2)}',
        )
        .join(' · ');

    Future<void> refresh() async {
      ref
        ..invalidate(introductionsProvider)
        ..invalidate(sessionsProvider)
        ..invalidate(myGroupsProvider);
      await ref
          .read(myGroupsProvider.future)
          .then<void>((_) {}, onError: (_) {});
    }

    final introError = received.error ?? sent.error;
    final sessionError = attending.error ?? hosting.error;

    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(KSpacing.md),
        children: [
          _SectionCard(
            key: const ValueKey('my-community-introductions'),
            icon: Icons.handshake_outlined,
            title: 'পরিচয়ের অনুরোধ',
            loading: received.isLoading || sent.isLoading,
            error: introError,
            errorLabel: 'অনুরোধগুলো লোড করা যায়নি।',
            onRetry: () => ref.invalidate(introductionsProvider),
            summary: received.hasValue && sent.hasValue
                ? line([
                    (
                      'উত্তরের অপেক্ষায়',
                      received.value!
                          .where((item) => item.status == 'PENDING')
                          .length,
                    ),
                    ('এসেছে', received.value!.length),
                    ('পাঠিয়েছি', sent.value!.length),
                  ])
                : null,
            actionLabel: 'সব অনুরোধ',
            onAction: () => context.push(CommunityPaths.introductions),
          ),
          _SectionCard(
            key: const ValueKey('my-community-sessions'),
            icon: Icons.event_outlined,
            title: 'সেশন ও পরামর্শ',
            loading: attending.isLoading || hosting.isLoading,
            error: sessionError,
            errorLabel: 'সেশনগুলো লোড করা যায়নি।',
            onRetry: () => ref.invalidate(sessionsProvider),
            summary: attending.hasValue && hosting.hasValue
                ? line([
                    ('যোগ দিচ্ছি', attending.value!.length),
                    ('আয়োজন করছি', hosting.value!.length),
                  ])
                : null,
            actionLabel: 'সব সেশন',
            onAction: () => context.push(CommunityPaths.sessions),
            // The next few sessions and consultations themselves, not only
            // how many there are.
            children: [
              for (final session in upcomingSessions(
                attending.valueOrNull,
                hosting.valueOrNull,
              ).take(3))
                Padding(
                  padding: const EdgeInsets.only(top: KSpacing.xs),
                  child: SessionCard(session: session),
                ),
            ],
          ),
          _SectionCard(
            key: const ValueKey('my-community-groups'),
            icon: Icons.diversity_3_outlined,
            title: 'আমার দল',
            loading: groups.isLoading,
            error: groups.error,
            errorLabel: 'দলগুলো লোড করা যায়নি।',
            onRetry: () => ref.invalidate(myGroupsProvider),
            summary: groups.hasValue
                ? line([
                    (
                      'সদস্য',
                      groups.value!.where((item) => item.isMember).length,
                    ),
                    (
                      'অপেক্ষমাণ',
                      groups.value!
                          .where((item) => item.myMembership?.pending ?? false)
                          .length,
                    ),
                  ])
                : null,
            actionLabel: 'সব দল',
            onAction: () => context.push(CommunityPaths.groups),
            children: [
              for (final group
                  in groups.valueOrNull?.take(3) ?? const <CommunityGroup>[])
                Padding(
                  padding: const EdgeInsets.only(top: KSpacing.xs),
                  child: GroupCard(group: group),
                ),
            ],
          ),
          const SizedBox(height: KSpacing.sm),
          FilledButton.tonalIcon(
            key: const ValueKey('my-community-new-group'),
            onPressed: () => context.push(CommunityPaths.newGroup),
            icon: const Icon(Icons.group_add_outlined),
            label: const KLocalizedText('নতুন দল শুরু করুন'),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.icon,
    required this.title,
    required this.loading,
    required this.error,
    required this.errorLabel,
    required this.onRetry,
    required this.summary,
    required this.actionLabel,
    required this.onAction,
    this.children = const [],
    super.key,
  });

  final String actionLabel;
  final List<Widget> children;
  final Object? error;
  final String errorLabel;
  final IconData icon;
  final bool loading;
  final VoidCallback onAction;
  final VoidCallback onRetry;
  final String? summary;
  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: KSpacing.md),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: KColors.primary),
                const SizedBox(width: KSpacing.sm),
                Expanded(
                  child: KLocalizedText(
                    title,
                    style: theme.textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: KSpacing.sm),
            if (error != null)
              RetryPanel(error: error, label: errorLabel, onRetry: onRetry)
            else if (loading)
              const LinearProgressIndicator()
            else if (summary != null)
              Text(summary!),
            ...children,
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: onAction,
                child: KLocalizedText(actionLabel),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Upcoming sessions and consultations from both lists, soonest first:
/// not cancelled, not completed, and not over.
List<CommunitySession> upcomingSessions(
  List<CommunitySession>? attending,
  List<CommunitySession>? hosting, {
  DateTime? now,
}) {
  final at = now ?? DateTime.now();
  final seen = <String>{};
  final all = [
    for (final item in [...?attending, ...?hosting])
      if (seen.add(item.id) &&
          item.status != 'CANCELLED' &&
          item.status != 'COMPLETED' &&
          (item.endsAt ?? item.startsAt ?? at).isAfter(at))
        item,
  ]..sort((a, b) => (a.startsAt ?? at).compareTo(b.startsAt ?? at));
  return all;
}

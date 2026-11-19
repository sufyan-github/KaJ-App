import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../community_routes.dart';
import '../domain/community_models.dart';
import 'community_providers.dart';
import 'community_widgets.dart';

/// My sessions: the ones I attend (consultations I booked, invitations,
/// group sessions) and the ones I host.
class SessionsScreen extends StatelessWidget {
  const SessionsScreen({super.key});

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 2,
    child: Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('সেশন ও পরামর্শ'),
        actions: [
          IconButton(
            key: const ValueKey('session-new'),
            tooltip: KaajLocalizations.text(context, 'নতুন সেশন'),
            icon: const Icon(Icons.add),
            onPressed: () => context.push(CommunityPaths.newSession),
          ),
        ],
        bottom: const TabBar(
          tabs: [
            Tab(
              key: ValueKey('sessions-attending'),
              child: KLocalizedText('যোগ দিচ্ছি'),
            ),
            Tab(
              key: ValueKey('sessions-hosting'),
              child: KLocalizedText('আয়োজন করছি'),
            ),
          ],
        ),
      ),
      body: const TabBarView(
        children: [
          SessionList(role: 'attending'),
          SessionList(role: 'hosting'),
        ],
      ),
    ),
  );
}

class SessionList extends ConsumerWidget {
  const SessionList({required this.role, super.key});

  /// `attending` or `hosting`.
  final String role;

  @override
  Widget build(
    BuildContext context,
    WidgetRef ref,
  ) => CommunityPagedList<CommunitySession>(
    provider: sessionsProvider(role),
    fetchMore: (cursor) =>
        ref.read(communityRepositoryProvider).sessions(role, cursor: cursor),
    loadMoreKey: ValueKey('sessions-$role-more'),
    errorLabel: 'সেশনগুলো লোড করা যায়নি।',
    empty: KEmptyState(
      icon: Icons.event_outlined,
      title: role == 'hosting'
          ? 'আপনি কোনো সেশন আয়োজন করছেন না'
          : 'কোনো সেশন নেই',
      message: role == 'hosting'
          ? 'অনুমোদিত মেন্টররা আলোচনা, কর্মশালা বা অনুষ্ঠান আয়োজন করতে পারেন।'
          : 'বিশেষজ্ঞের পরামর্শ নিলে বা কোনো দলের সেশনে যোগ দিলে এখানে দেখা যাবে।',
    ),
    itemBuilder: (context, item) => SessionCard(session: item),
  );
}

class SessionCard extends StatelessWidget {
  const SessionCard({required this.session, super.key});

  final CommunitySession session;

  @override
  Widget build(BuildContext context) {
    final item = session;
    final theme = Theme.of(context);
    final language = Localizations.localeOf(context).languageCode;
    return Card(
      key: ValueKey('session-${item.id}'),
      margin: EdgeInsets.zero,
      child: ListTile(
        onTap: () => context.push(CommunityPaths.session(item.id)),
        title: Text(item.title, style: theme.textTheme.titleMedium),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              [
                KaajLocalizations.text(context, sessionKindLabel(item.kind)),
                if (item.startsAt != null)
                  KFormat.dayAndTime(context, item.startsAt!),
                if (item.mode == SessionMode.inPerson && item.area != null)
                  item.area!.nameFor(language)
                else
                  KaajLocalizations.text(context, sessionModeLabel(item.mode)),
              ].join(' · '),
            ),
            const SizedBox(height: KSpacing.xs),
            Wrap(
              spacing: KSpacing.xs,
              runSpacing: KSpacing.xs,
              children: [
                StatusPill(
                  sessionStatusLabel(item.status),
                  color: statusColor(item.status),
                ),
                if (!item.isHost && item.myStatus != null)
                  StatusPill(
                    participantStatusLabel(item.myStatus!),
                    color: statusColor(item.myStatus!),
                  ),
                if (item.womenOnly)
                  const StatusPill('শুধু নারীদের', color: KColors.secondary),
              ],
            ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

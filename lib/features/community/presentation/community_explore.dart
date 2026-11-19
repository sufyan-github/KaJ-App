import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../profile/presentation/controllers/me_provider.dart';
import '../community_routes.dart';
import '../domain/community_models.dart';
import 'community_providers.dart';
import 'community_widgets.dart';
import 'group_screens.dart';

/// Explore, Community: public groups to join, searched with the Explore
/// box, plus a way to the experts.
class CommunityExploreBody extends ConsumerStatefulWidget {
  const CommunityExploreBody({this.searchQuery = '', super.key});

  final String searchQuery;

  @override
  ConsumerState<CommunityExploreBody> createState() =>
      _CommunityExploreBodyState();
}

class _CommunityExploreBodyState extends ConsumerState<CommunityExploreBody> {
  late String _q = groupQuery(widget.searchQuery);
  String? _locationId;
  bool _womenOnly = false;
  Timer? _debounce;

  @override
  void didUpdateWidget(CommunityExploreBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    final next = groupQuery(widget.searchQuery);
    _debounce?.cancel();
    if (next == _q) return;
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (mounted) setState(() => _q = next);
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final area = ref.watch(meProvider).valueOrNull?.areaId;
    final search = (q: _q, locationId: _locationId, womenOnly: _womenOnly);
    return CommunityPagedList<CommunityGroup>(
      provider: groupSearchProvider(search),
      fetchMore: (cursor) => ref
          .read(communityRepositoryProvider)
          .searchGroups(
            q: _q,
            locationId: _locationId,
            womenOnly: _womenOnly,
            cursor: cursor,
          ),
      loadMoreKey: const ValueKey('groups-more'),
      errorLabel: 'দলগুলো লোড করা যায়নি।',
      header: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            KSpacing.md,
            KSpacing.sm,
            KSpacing.md,
            0,
          ),
          child: Wrap(
            spacing: KSpacing.sm,
            runSpacing: KSpacing.xs,
            children: [
              if (area != null)
                FilterChip(
                  key: const ValueKey('groups-near-me'),
                  avatar: const Icon(Icons.near_me_outlined, size: 18),
                  label: const KLocalizedText('আমার এলাকায়'),
                  selected: _locationId == area,
                  onSelected: (on) =>
                      setState(() => _locationId = on ? area : null),
                ),
              FilterChip(
                key: const ValueKey('groups-women-only'),
                label: const KLocalizedText('শুধু নারীদের'),
                selected: _womenOnly,
                onSelected: (on) => setState(() => _womenOnly = on),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            KSpacing.md,
            KSpacing.sm,
            KSpacing.md,
            KSpacing.xs,
          ),
          child: Wrap(
            spacing: KSpacing.sm,
            runSpacing: KSpacing.xs,
            children: [
              OutlinedButton.icon(
                key: const ValueKey('community-my-groups'),
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: () => context.push(CommunityPaths.groups),
                icon: const Icon(Icons.diversity_3_outlined),
                label: const KLocalizedText('আমার দল'),
              ),
              OutlinedButton.icon(
                key: const ValueKey('community-new-group'),
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: () => context.push(CommunityPaths.newGroup),
                icon: const Icon(Icons.group_add_outlined),
                label: const KLocalizedText('নতুন দল'),
              ),
              OutlinedButton.icon(
                key: const ValueKey('community-experts'),
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                // Replaces Explore rather than stacking a second one.
                onPressed: () => context.go('/explore?section=people'),
                icon: const Icon(Icons.school_outlined),
                label: const KLocalizedText('বিশেষজ্ঞ খুঁজুন'),
              ),
            ],
          ),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: KSpacing.md),
          child: KLocalizedText(
            'বিশেষজ্ঞরা মানুষ > মেন্টর অংশে আছেন। সেখান থেকে পরিচয়ের অনুরোধ বা পরামর্শের সময় নিন।',
          ),
        ),
        const SizedBox(height: KSpacing.sm),
      ],
      empty: KEmptyState(
        icon: Icons.diversity_3_outlined,
        title: _q.isEmpty ? 'এখনো কোনো দল নেই' : 'কোনো দল মেলেনি',
        message: _q.isEmpty
            ? 'আপনার এলাকা বা কাজের মানুষদের নিয়ে একটি দল শুরু করুন।'
            : 'অন্য শব্দে খুঁজুন বা ফিল্টার বদলান।',
      ),
      itemBuilder: (context, group) => GroupCard(group: group),
    );
  }
}

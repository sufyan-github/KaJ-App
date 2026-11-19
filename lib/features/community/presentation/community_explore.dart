import 'package:flutter/material.dart';

import '../../../core/widgets/k_empty_state.dart';

/// Explore, Community: groups, experts and sessions.
class CommunityExploreBody extends StatelessWidget {
  const CommunityExploreBody({this.searchQuery = '', super.key});

  final String searchQuery;

  @override
  Widget build(BuildContext context) => const KEmptyState(
    icon: Icons.diversity_3_outlined,
    title: 'শীঘ্রই আসছে',
    message: 'এই অংশটি তৈরি হচ্ছে।',
  );
}

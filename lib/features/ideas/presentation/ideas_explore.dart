import 'package:flutter/material.dart';

import '../../../core/widgets/k_empty_state.dart';

/// Explore, Ideas: public idea cards.
class IdeasExploreBody extends StatelessWidget {
  const IdeasExploreBody({this.searchQuery = '', super.key});

  final String searchQuery;

  @override
  Widget build(BuildContext context) => const KEmptyState(
    icon: Icons.lightbulb_outline,
    title: 'শীঘ্রই আসছে',
    message: 'এই অংশটি তৈরি হচ্ছে।',
  );
}

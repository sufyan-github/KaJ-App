import 'package:flutter/material.dart';

import '../../../core/widgets/k_empty_state.dart';

/// Explore, Business: partner directory and businesses.
class BusinessExploreBody extends StatelessWidget {
  const BusinessExploreBody({this.searchQuery = '', super.key});

  final String searchQuery;

  @override
  Widget build(BuildContext context) => const KEmptyState(
    icon: Icons.storefront_outlined,
    title: 'শীঘ্রই আসছে',
    message: 'এই অংশটি তৈরি হচ্ছে।',
  );
}

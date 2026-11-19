import 'package:flutter/material.dart';

import '../../../core/widgets/k_empty_state.dart';

/// My activity, Community: introductions, sessions, groups.
class MyCommunitySection extends StatelessWidget {
  const MyCommunitySection({super.key});

  @override
  Widget build(BuildContext context) => const KEmptyState(
    icon: Icons.diversity_3_outlined,
    title: 'শীঘ্রই আসছে',
    message: 'এই অংশটি তৈরি হচ্ছে।',
  );
}

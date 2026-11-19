import 'package:flutter/material.dart';

import '../../../core/widgets/k_empty_state.dart';

/// My activity, Ideas: owned, team and access.
class MyIdeasSection extends StatelessWidget {
  const MyIdeasSection({super.key});

  @override
  Widget build(BuildContext context) => const KEmptyState(
    icon: Icons.lightbulb_outline,
    title: 'শীঘ্রই আসছে',
    message: 'এই অংশটি তৈরি হচ্ছে।',
  );
}

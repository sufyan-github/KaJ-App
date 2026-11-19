import 'package:flutter/material.dart';

import '../../../core/widgets/k_empty_state.dart';

/// My activity, Business: my businesses, invitations, collaboration.
class MyBusinessSection extends StatelessWidget {
  const MyBusinessSection({super.key});

  @override
  Widget build(BuildContext context) => const KEmptyState(
    icon: Icons.storefront_outlined,
    title: 'শীঘ্রই আসছে',
    message: 'এই অংশটি তৈরি হচ্ছে।',
  );
}

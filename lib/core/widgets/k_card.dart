import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class KCard extends StatelessWidget {
  const KCard({
    required this.child,
    this.padding = const EdgeInsets.all(KSpacing.md),
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 1,
      margin: const EdgeInsets.symmetric(vertical: KSpacing.sm),
      color: Theme.of(context).colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: KColors.border),
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

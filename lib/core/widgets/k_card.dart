import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class KCard extends StatelessWidget {
  const KCard({
    required this.child,
    this.padding = const EdgeInsets.all(KSpacing.md),
    this.margin = const EdgeInsets.symmetric(vertical: KSpacing.sm),
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry margin;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: margin,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(KRadius.md),
        side: const BorderSide(color: KColors.border),
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

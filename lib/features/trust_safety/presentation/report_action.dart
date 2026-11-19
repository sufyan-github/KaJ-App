import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';

/// App-bar button that opens the safety report form for one target.
class ReportAction extends StatelessWidget {
  const ReportAction({
    required this.targetType,
    required this.targetId,
    super.key,
  });

  final String targetType;
  final String targetId;

  @override
  Widget build(BuildContext context) => IconButton(
    key: ValueKey('report-$targetType'),
    tooltip: KaajLocalizations.text(context, 'রিপোর্ট করুন'),
    icon: const Icon(Icons.flag_outlined),
    onPressed: () => context.push(AppRoutes.report(targetType, targetId)),
  );
}

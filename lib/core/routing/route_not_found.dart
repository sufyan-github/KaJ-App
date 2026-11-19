import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../widgets/k_empty_state.dart';
import '../widgets/k_localized_text.dart';
import 'app_router.dart';

/// Shown for a link this version of the app cannot open (an old or newer
/// notification, a mistyped deep link) instead of the router's raw error.
class RouteNotFoundScreen extends StatelessWidget {
  const RouteNotFoundScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(),
    body: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const KEmptyState(
          icon: Icons.link_off,
          title: 'এই পাতাটি খোলা যাচ্ছে না',
          message:
              'লিংকটি পুরোনো বা অ্যাপের এই সংস্করণে নেই। অ্যাপ হালনাগাদ করে আবার চেষ্টা করুন।',
        ),
        FilledButton(
          key: const ValueKey('not-found-home'),
          onPressed: () => context.go(AppRoutes.home),
          child: const KLocalizedText('হোমে ফিরুন'),
        ),
      ],
    ),
  );
}

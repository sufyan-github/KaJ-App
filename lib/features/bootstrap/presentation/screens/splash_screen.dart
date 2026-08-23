import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../features/auth/presentation/controllers/auth_providers.dart';
import '../../../../l10n/generated/app_localizations.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _resolveSession());
  }

  Future<void> _resolveSession() async {
    final restored = await ref
        .read(authControllerProvider.notifier)
        .restoreSession()
        .timeout(const Duration(seconds: 3), onTimeout: () => false);
    if (!mounted) return;
    context.go(restored ? AppRoutes.home : AppRoutes.phone);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: KColors.primary,
      body: SafeArea(
        child: Center(
          child: Semantics(
            label: l10n.appStarting,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const _BrandMark(),
                const SizedBox(height: KSpacing.lg),
                const SizedBox.square(
                  dimension: 24,
                  child: CircularProgressIndicator(
                    color: Colors.white,
                    strokeWidth: 2.5,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
          ),
          child: const Icon(
            Icons.handshake_outlined,
            size: 44,
            color: KColors.primary,
          ),
        ),
        const SizedBox(height: KSpacing.md),
        Text(
          AppLocalizations.of(context).appName,
          style: Theme.of(context).textTheme.displayLarge?.copyWith(
            color: Colors.white,
            letterSpacing: 3,
          ),
        ),
        Text(
          AppLocalizations.of(context).appTagline,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            color: Colors.white.withValues(alpha: 0.86),
          ),
        ),
      ],
    );
  }
}

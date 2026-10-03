import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_error_message.dart';
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
        .restoreSession();
    if (!mounted) return;
    if (ref.read(authControllerProvider).failure != null) return;
    context.go(restored ? AppRoutes.home : AppRoutes.phone);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final failure = ref.watch(authControllerProvider).failure;
    if (failure != null) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(KSpacing.lg),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  KErrorMessage(failure: failure),
                  const SizedBox(height: KSpacing.md),
                  FilledButton(
                    onPressed: _resolveSession,
                    child: Text(l10n.tryAgain),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }
    return Scaffold(
      backgroundColor: KColors.background,
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
                    color: KColors.primary,
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
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: KColors.surfaceAlt,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.handshake_rounded,
            size: 34,
            color: KColors.primary,
          ),
        ),
        const SizedBox(height: KSpacing.md),
        Text(
          AppLocalizations.of(context).appName,
          style: Theme.of(context).textTheme.displayLarge?.copyWith(
            color: KColors.primary,
            letterSpacing: 1.2,
          ),
        ),
        Text(
          AppLocalizations.of(context).appTagline,
          style: Theme.of(
            context,
          ).textTheme.bodyLarge?.copyWith(color: KColors.textSecondary),
        ),
      ],
    );
  }
}

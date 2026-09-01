import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_primary_button.dart';
import '../../../../l10n/generated/app_localizations.dart';
import '../../../auth/presentation/controllers/auth_controller.dart';
import '../../../auth/presentation/controllers/auth_providers.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(authControllerProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('KAAJ'),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(KSpacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Column(
                children: [
                  Container(
                    width: 88,
                    height: 88,
                    decoration: BoxDecoration(
                      color: KColors.primary.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.verified_user_outlined,
                      size: 48,
                      color: KColors.primary,
                    ),
                  ),
                  const SizedBox(height: KSpacing.lg),
                  Text(
                    l10n.welcomeTitle,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: KSpacing.sm),
                  Text(
                    l10n.welcomeBody,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: KColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: KSpacing.xl),
                  Wrap(
                    spacing: KSpacing.sm,
                    runSpacing: KSpacing.sm,
                    alignment: WrapAlignment.center,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () => context.push(AppRoutes.categories),
                        icon: const Icon(Icons.category_outlined),
                        label: const Text('কাজের ধরন'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () =>
                            context.push(AppRoutes.publicWorkerProfile),
                        icon: const Icon(Icons.person_search_outlined),
                        label: const Text('পাবলিক প্রোফাইল'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => context.push(AppRoutes.settings),
                        icon: const Icon(Icons.settings_outlined),
                        label: const Text('সেটিংস'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () =>
                            context.push(AppRoutes.editWorkerSkills),
                        icon: const Icon(Icons.handyman_outlined),
                        label: const Text('দক্ষতা সম্পাদনা'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () =>
                            context.push(AppRoutes.editAvailability),
                        icon: const Icon(Icons.calendar_month_outlined),
                        label: const Text('সময় সম্পাদনা'),
                      ),
                    ],
                  ),
                  const SizedBox(height: KSpacing.lg),
                  KPrimaryButton(
                    label: l10n.signOut,
                    isLoading: state.status == AuthStatus.loading,
                    onPressed: () async {
                      await ref.read(authControllerProvider.notifier).logout();
                      if (context.mounted) context.go(AppRoutes.phone);
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

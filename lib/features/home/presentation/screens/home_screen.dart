import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_primary_button.dart';
import '../../../../l10n/generated/app_localizations.dart';
import '../../../auth/presentation/controllers/auth_controller.dart';
import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../../notifications/presentation/controllers/notifications_providers.dart';
import '../../../onboarding/domain/onboarding_state.dart';
import '../../../onboarding/presentation/controllers/onboarding_controller.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(authControllerProvider);
    final isWorker =
        ref.watch(onboardingControllerProvider).role == KaajRole.worker;
    final unreadNotifications = ref
        .watch(notificationsProvider)
        .maybeWhen(data: (inbox) => inbox.unreadCount, orElse: () => 0);
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
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'দ্রুত কাজ',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  const SizedBox(height: KSpacing.md),
                  GridView.count(
                    crossAxisCount: 2,
                    crossAxisSpacing: KSpacing.md,
                    mainAxisSpacing: KSpacing.md,
                    childAspectRatio: 1.18,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      _DashboardTile(
                        icon: isWorker
                            ? Icons.manage_search_outlined
                            : Icons.post_add_outlined,
                        title: isWorker ? 'কাজ খুঁজুন' : 'কাজ পোস্ট করুন',
                        subtitle: isWorker
                            ? 'খালি কাজ ও সময় দেখুন'
                            : 'সময়সহ নতুন কাজ দিন',
                        onTap: () => context.push(
                          isWorker ? AppRoutes.jobs : AppRoutes.createJob,
                        ),
                      ),
                      if (!isWorker)
                        _DashboardTile(
                          icon: Icons.people_alt_outlined,
                          title: 'কর্মী খুঁজুন',
                          subtitle: 'খালি সময় দেখে বুক করুন',
                          onTap: () => context.push(AppRoutes.workers),
                        ),
                      if (!isWorker)
                        _DashboardTile(
                          icon: Icons.favorite_border,
                          title: 'পছন্দের কর্মী',
                          subtitle: 'সংরক্ষিত কর্মী আবার বুক করুন',
                          onTap: () => context.push(AppRoutes.favorites),
                        ),
                      if (!isWorker)
                        _DashboardTile(
                          icon: Icons.assignment_outlined,
                          title: 'আমার পোস্ট',
                          subtitle: 'আবেদন দেখুন ও কর্মী বাছুন',
                          onTap: () => context.push(AppRoutes.jobs),
                        ),
                      _DashboardTile(
                        icon: Icons.event_available_outlined,
                        title: 'বুকিং ও কাজ',
                        subtitle: 'অনুরোধ নিশ্চিত ও অনুসরণ করুন',
                        onTap: () => context.push(AppRoutes.assignments),
                      ),
                      _DashboardTile(
                        icon: Icons.category_outlined,
                        title: 'কাজের ধরন',
                        subtitle: 'সেবা ও দক্ষতা দেখুন',
                        onTap: () => context.push(AppRoutes.categories),
                      ),
                      _DashboardTile(
                        icon: Icons.notifications_outlined,
                        title: 'নোটিফিকেশন',
                        subtitle: 'আবেদন ও বুকিং আপডেট দেখুন',
                        badgeCount: unreadNotifications,
                        onTap: () => context.push(AppRoutes.notifications),
                      ),
                      _DashboardTile(
                        icon: Icons.forum_outlined,
                        title: 'বার্তা',
                        subtitle: 'কাজের আলোচনা নিরাপদে করুন',
                        onTap: () => context.push(AppRoutes.conversations),
                      ),
                      _DashboardTile(
                        icon: Icons.reviews_outlined,
                        title: 'রিভিউ',
                        subtitle: 'আপনার পাওয়া মতামত দেখুন',
                        onTap: () => context.push(AppRoutes.reviews),
                      ),
                      _DashboardTile(
                        icon: Icons.verified_user_outlined,
                        title: 'যাচাইকরণ',
                        subtitle: 'পরিচয় ও দক্ষতা যাচাই করুন',
                        onTap: () => context.push(AppRoutes.verification),
                      ),
                      _DashboardTile(
                        icon: Icons.gavel_outlined,
                        title: 'বিরোধ',
                        subtitle: 'প্রমাণ ও সিদ্ধান্ত অনুসরণ করুন',
                        onTap: () => context.push(AppRoutes.disputes),
                      ),
                      if (isWorker) ...[
                        _DashboardTile(
                          icon: Icons.person_search_outlined,
                          title: 'পাবলিক প্রোফাইল',
                          subtitle: 'আপনার প্রোফাইল দেখুন',
                          onTap: () =>
                              context.push(AppRoutes.publicWorkerProfile),
                        ),
                        _DashboardTile(
                          icon: Icons.handyman_outlined,
                          title: 'দক্ষতা',
                          subtitle: 'দক্ষতা ও পারিশ্রমিক বদলান',
                          onTap: () => context.push(AppRoutes.editWorkerSkills),
                        ),
                        _DashboardTile(
                          icon: Icons.calendar_month_outlined,
                          title: 'কাজের সময়',
                          subtitle: 'দিন ও খালি সময় ঠিক করুন',
                          onTap: () => context.push(AppRoutes.editAvailability),
                        ),
                        _DashboardTile(
                          icon: Icons.photo_library_outlined,
                          title: 'পোর্টফোলিও',
                          subtitle: 'আপনার কাজের নমুনা দেখান',
                          onTap: () => context.push(AppRoutes.portfolio),
                        ),
                      ],
                      _DashboardTile(
                        icon: Icons.settings_outlined,
                        title: 'সেটিংস',
                        subtitle: 'অ্যাকাউন্ট ও নিরাপত্তা',
                        onTap: () => context.push(AppRoutes.settings),
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

class _DashboardTile extends StatelessWidget {
  const _DashboardTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badgeCount = 0,
  });

  final int badgeCount;
  final IconData icon;
  final VoidCallback onTap;
  final String subtitle;
  final String title;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: badgeCount > 0
        ? '$title, ${_banglaNumber(badgeCount)}টি অপঠিত আপডেট'
        : title,
    child: Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(KSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: KColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, color: KColors.primary),
                  ),
                  if (badgeCount > 0)
                    Positioned(
                      top: -7,
                      right: -10,
                      child: Badge(
                        backgroundColor: KColors.danger,
                        label: Text(
                          badgeCount > 99 ? '৯৯+' : _banglaNumber(badgeCount),
                        ),
                      ),
                    ),
                ],
              ),
              const Spacer(),
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: KSpacing.xs),
              Text(
                subtitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: KColors.textSecondary),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

String _banglaNumber(int value) => value.toString().replaceAllMapped(
  RegExp(r'\d'),
  (match) => '০১২৩৪৫৬৭৮৯'[int.parse(match.group(0)!)],
);

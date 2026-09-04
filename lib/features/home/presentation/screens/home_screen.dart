import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
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
    final onboarding = ref.watch(onboardingControllerProvider);
    final isWorker = onboarding.role == KaajRole.worker;
    final unreadNotifications = ref
        .watch(notificationsProvider)
        .maybeWhen(data: (inbox) => inbox.unreadCount, orElse: () => 0);
    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('KAAJ'),
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            tooltip: KaajLocalizations.text(context, 'নোটিফিকেশন'),
            onPressed: () => context.push(AppRoutes.notifications),
            icon: Badge(
              isLabelVisible: unreadNotifications > 0,
              label: KLocalizedText(
                unreadNotifications > 99
                    ? '৯৯+'
                    : _banglaNumber(unreadNotifications),
              ),
              child: const Icon(Icons.notifications_outlined),
            ),
          ),
          IconButton(
            tooltip: KaajLocalizations.text(context, 'সেটিংস'),
            onPressed: () => context.push(AppRoutes.settings),
            icon: const Icon(Icons.settings_outlined),
          ),
          const SizedBox(width: KSpacing.xs),
        ],
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
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: KColors.primary.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.verified_user_outlined,
                      size: 38,
                      color: KColors.primary,
                    ),
                  ),
                  const SizedBox(height: KSpacing.lg),
                  KLocalizedText(
                    onboarding.displayName.trim().isEmpty
                        ? l10n.welcomeTitle
                        : KaajLocalizations.isEnglish(context)
                        ? 'Welcome, ${onboarding.displayName.trim()}'
                        : 'স্বাগতম, ${onboarding.displayName.trim()}',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: KSpacing.sm),
                  KLocalizedText(
                    l10n.welcomeBody,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: KColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: KSpacing.lg),
                  _LocalDiscoveryCard(
                    isWorker: isWorker,
                    onTap: () => context.push(
                      isWorker ? AppRoutes.jobs : AppRoutes.workers,
                    ),
                  ),
                  const SizedBox(height: KSpacing.xl),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: KLocalizedText(
                      'দ্রুত কাজ',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  const SizedBox(height: KSpacing.md),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final textScale =
                          (MediaQuery.textScalerOf(context).scale(16) / 16)
                              .clamp(1, 2);
                      final columns = textScale >= 1.5
                          ? 1
                          : constraints.maxWidth >= 520
                          ? 3
                          : 2;
                      final tileWidth =
                          (constraints.maxWidth -
                              (KSpacing.md * (columns - 1))) /
                          columns;
                      final tileHeight = 184 + ((textScale - 1) * 140);
                      return GridView.count(
                        crossAxisCount: columns,
                        crossAxisSpacing: KSpacing.md,
                        mainAxisSpacing: KSpacing.md,
                        childAspectRatio: tileWidth / tileHeight,
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
                              onTap: () =>
                                  context.push(AppRoutes.editWorkerSkills),
                            ),
                            _DashboardTile(
                              icon: Icons.calendar_month_outlined,
                              title: 'কাজের সময়',
                              subtitle: 'দিন ও খালি সময় ঠিক করুন',
                              onTap: () =>
                                  context.push(AppRoutes.editAvailability),
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
                      );
                    },
                  ),
                  const SizedBox(height: KSpacing.lg),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.logout),
                      label: KLocalizedText(l10n.signOut),
                      onPressed: state.status == AuthStatus.loading
                          ? null
                          : () async {
                              await ref
                                  .read(authControllerProvider.notifier)
                                  .logout();
                              if (context.mounted) {
                                context.go(AppRoutes.phone);
                              }
                            },
                    ),
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

class _LocalDiscoveryCard extends StatelessWidget {
  const _LocalDiscoveryCard({required this.isWorker, required this.onTap});

  final bool isWorker;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    color: KColors.primary.withValues(alpha: 0.08),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.lg),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(Icons.near_me_outlined, color: KColors.primary),
            ),
            const SizedBox(width: KSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  KLocalizedText(
                    isWorker ? 'আপনার এলাকার কাজ' : 'আপনার এলাকার কর্মী',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: KSpacing.xs),
                  KLocalizedText(
                    isWorker
                        ? 'দক্ষতা ও খালি সময় মিলিয়ে কাছের কাজ দেখুন'
                        : 'দক্ষতা, যাচাই ও খালি সময় দেখে কর্মী বাছুন',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: KColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: KSpacing.sm),
            const Icon(Icons.arrow_forward, color: KColors.primary),
          ],
        ),
      ),
    ),
  );
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
  Widget build(BuildContext context) {
    final localizedTitle = KaajLocalizations.text(context, title);
    final unreadLabel = KaajLocalizations.isEnglish(context)
        ? '$badgeCount unread updates'
        : '${_banglaNumber(badgeCount)}টি অপঠিত আপডেট';
    return Semantics(
      button: true,
      label: badgeCount > 0 ? '$localizedTitle, $unreadLabel' : localizedTitle,
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(KSpacing.sm),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
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
                          label: KLocalizedText(
                            badgeCount > 99 ? '৯৯+' : _banglaNumber(badgeCount),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: KSpacing.md),
                KLocalizedText(
                  title,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: KSpacing.xs),
                KLocalizedText(
                  subtitle,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: KColors.textSecondary,
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

String _banglaNumber(int value) => value.toString().replaceAllMapped(
  RegExp(r'\d'),
  (match) => '০১২৩৪৫৬৭৮৯'[int.parse(match.group(0)!)],
);

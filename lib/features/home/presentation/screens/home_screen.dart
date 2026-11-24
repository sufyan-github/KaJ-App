import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_error_state.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../../core/widgets/k_trust_banner.dart';
import '../../../ai/presentation/ai_suggestions.dart';
import '../../../catalog/presentation/controllers/catalog_providers.dart';
import '../../../notifications/presentation/controllers/notifications_providers.dart';
import '../../../profile/presentation/controllers/me_provider.dart';
import '../../../profile/presentation/widgets/profile_completeness_card.dart';
import '../../../training/presentation/widgets/my_training_card.dart';
import '../../../training/presentation/widgets/training_offer_gate.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // The role comes from the server, so a returning worker on a new phone
    // gets the worker home even though this phone has no onboarding draft.
    final meAsync = ref.watch(meProvider);
    final me = meAsync.valueOrNull;
    if (me == null) {
      return Scaffold(
        body: Center(
          child: meAsync.hasError
              ? KErrorState(
                  failure: ErrorMapper.from(meAsync.error!),
                  retryLabel: 'আবার চেষ্টা করুন',
                  onRetry: () => refreshMe(ref),
                )
              : const CircularProgressIndicator(),
        ),
      );
    }
    final isWorker = me.isWorker;
    final language = Localizations.localeOf(context).languageCode;
    final areaId = me.areaId;
    final areaName = me.area?.nameFor(language);
    // "Near you" is a real area filter; without an area, set one first.
    final nearYou = areaId == null || areaName == null
        ? AppRoutes.editProfile
        : AppRoutes.jobsInArea(areaId: areaId, areaName: areaName);
    final unreadNotifications = ref
        .watch(notificationsProvider)
        .maybeWhen(data: (inbox) => inbox.unreadCount, orElse: () => 0);
    return Scaffold(
      appBar: AppBar(
        centerTitle: false,
        title: const KLocalizedText(
          'KAAJ',
          style: TextStyle(
            color: KColors.primary,
            fontSize: 21,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.2,
          ),
        ),
        automaticallyImplyLeading: false,
        actions: [
          // One spoken label: "Notifications, 2 unread", not just "2".
          Semantics(
            key: const ValueKey('home-bell'),
            button: true,
            excludeSemantics: true,
            label: bellSemanticsLabel(context, unreadNotifications),
            onTap: () => context.push(AppRoutes.notifications),
            child: IconButton(
              tooltip: KaajLocalizations.text(context, 'নোটিফিকেশন'),
              onPressed: () => context.push(AppRoutes.notifications),
              icon: Badge(
                isLabelVisible: unreadNotifications > 0,
                label: KLocalizedText(
                  unreadNotifications > 99
                      ? '৯৯+'
                      : _banglaNumber(unreadNotifications),
                ),
                child: const Icon(Icons.notifications_none_rounded),
              ),
            ),
          ),
          IconButton(
            tooltip: KaajLocalizations.text(context, 'প্রোফাইল'),
            onPressed: () => context.push(AppRoutes.settings),
            icon: const Icon(
              Icons.account_circle_outlined,
              color: KColors.primary,
            ),
          ),
          const SizedBox(width: KSpacing.xs),
        ],
      ),
      bottomNavigationBar: _HomeNavigation(isWorker: isWorker),
      body: SafeArea(
        top: false,
        child: TrainingOfferGate(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              KSpacing.md,
              KSpacing.sm,
              KSpacing.md,
              KSpacing.xl,
            ),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 620),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (!isWorker)
                      KLocalizedText(
                        'কী কাজ করাতে চান?',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    if (!isWorker) const SizedBox(height: KSpacing.sm),
                    Row(
                      children: [
                        Expanded(
                          child: _TopAction(
                            icon: Icons.location_on_outlined,
                            label: areaName ?? 'আপনার এলাকা',
                            onTap: () => context.push(
                              isWorker ? nearYou : AppRoutes.editProfile,
                            ),
                          ),
                        ),
                        const SizedBox(width: KSpacing.sm),
                        Expanded(
                          child: _TopAction(
                            icon: Icons.search_rounded,
                            label: isWorker ? 'কাজ অনুসন্ধান' : 'সেবা খুঁজুন',
                            onTap: () => context.push(
                              isWorker ? AppRoutes.jobs : AppRoutes.workers,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (isWorker) ...[
                      const SizedBox(height: KSpacing.sm),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton(
                              onPressed: () => context.push(AppRoutes.jobs),
                              child: const KLocalizedText('আপনার জন্য'),
                            ),
                          ),
                          const SizedBox(width: KSpacing.sm),
                          Expanded(
                            child: TextButton(
                              onPressed: () => context.push(nearYou),
                              style: TextButton.styleFrom(
                                backgroundColor: KColors.surfaceAlt,
                                minimumSize: const Size.fromHeight(44),
                              ),
                              child: const KLocalizedText('আপনার এলাকায়'),
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    _LocalDiscoveryCard(
                      isWorker: isWorker,
                      onTap: () => context.push(
                        isWorker ? AppRoutes.jobs : AppRoutes.createJob,
                      ),
                    ),
                    if (isWorker) ...[
                      const SizedBox(height: KSpacing.sm),
                      const ProfileCompletenessCard(),
                      const MyTrainingCard(),
                    ],
                    // Hidden unless KAAJ AI is on.
                    const AiSuggestionsCard(),
                    const SizedBox(height: KSpacing.md),
                    _SectionHeader(
                      title: isWorker ? 'কাছাকাছি কাজ' : 'জনপ্রিয় সেবা',
                      onTap: () => context.push(
                        isWorker ? AppRoutes.jobs : AppRoutes.categories,
                      ),
                    ),
                    const SizedBox(height: KSpacing.sm),
                    if (isWorker)
                      Column(
                        children: [
                          _ShortcutRow(
                            icon: Icons.school_outlined,
                            title: 'দক্ষতার সঙ্গে মেলা কাজ',
                            subtitle: 'দক্ষতা ও এলাকার মিল অনুযায়ী সাজানো',
                            onTap: () => context.push(AppRoutes.jobs),
                          ),
                          const SizedBox(height: KSpacing.sm),
                          _ShortcutRow(
                            icon: Icons.event_available_outlined,
                            title: 'আপনার সময়ে মেলা কাজ',
                            subtitle: 'শুধু আপনার খালি সময়ের সঙ্গে মেলা পোস্ট',
                            onTap: () =>
                                context.push(AppRoutes.jobsMatchingTime),
                          ),
                        ],
                      )
                    else
                      // Real categories from the catalog, each opening its
                      // own posts, instead of fixed labels that all opened
                      // the same list.
                      _PopularCategories(language: language),
                    const SizedBox(height: KSpacing.md),
                    const KTrustBanner(
                      message: 'পরিচয় যাচাই ও নিরাপদ কাজের রেকর্ড',
                      icon: Icons.shield_outlined,
                      warning: true,
                    ),
                    const SizedBox(height: KSpacing.xl),
                    _SectionHeader(title: 'সব সুবিধা'),
                    const SizedBox(height: KSpacing.md),
                    _DashboardGrid(
                      isWorker: isWorker,
                      unreadNotifications: unreadNotifications,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TopAction extends StatelessWidget {
  const _TopAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: KColors.surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(KRadius.md),
      side: const BorderSide(color: KColors.border),
    ),
    child: InkWell(
      borderRadius: BorderRadius.circular(KRadius.md),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        child: Row(
          children: [
            Icon(icon, size: 20, color: KColors.primary),
            const SizedBox(width: KSpacing.sm),
            Expanded(
              child: KLocalizedText(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _LocalDiscoveryCard extends StatelessWidget {
  const _LocalDiscoveryCard({required this.isWorker, required this.onTap});

  final bool isWorker;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: KColors.primary,
    borderRadius: BorderRadius.circular(14),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: KColors.secondary,
                      borderRadius: BorderRadius.circular(KRadius.pill),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 5,
                      ),
                      child: KLocalizedText(
                        isWorker ? 'এখনই কাজের সময়' : 'দ্রুত পোস্ট',
                        style: const TextStyle(
                          color: KColors.onPrimary,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  KLocalizedText(
                    isWorker ? 'আপনার কাছের কাজ দেখুন' : 'কাজ পোস্ট করুন',
                    style: Theme.of(
                      context,
                    ).textTheme.titleLarge?.copyWith(color: KColors.onPrimary),
                  ),
                  const SizedBox(height: KSpacing.xs),
                  KLocalizedText(
                    isWorker
                        ? 'দক্ষতা ও খালি সময় মিলিয়ে দ্রুত আবেদন করুন'
                        : 'কাছের যাচাইকৃত কর্মীরা আজই সাড়া দিতে পারবেন',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: KColors.onPrimary),
                  ),
                ],
              ),
            ),
            const SizedBox(width: KSpacing.md),
            Container(
              width: 66,
              height: 66,
              decoration: BoxDecoration(
                color: KColors.primaryDark,
                shape: BoxShape.circle,
                border: Border.all(color: KColors.onPrimary, width: 6),
              ),
              child: Icon(
                isWorker ? Icons.schedule_rounded : Icons.edit_rounded,
                color: KColors.secondary,
                size: 30,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.onTap});

  final VoidCallback? onTap;
  final String title;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: KLocalizedText(
          title,
          style: Theme.of(context).textTheme.titleMedium,
        ),
      ),
      if (onTap != null)
        TextButton(onPressed: onTap, child: const KLocalizedText('সব দেখুন')),
    ],
  );
}

class _ShortcutRow extends StatelessWidget {
  const _ShortcutRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;
  final String subtitle;
  final String title;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: InkWell(
      borderRadius: BorderRadius.circular(KRadius.md),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: KColors.border)),
        ),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: KColors.surfaceAlt,
              foregroundColor: KColors.primary,
              child: Icon(icon, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  KLocalizedText(
                    title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  KLocalizedText(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.chevron_right_rounded,
              color: KColors.textSecondary,
            ),
          ],
        ),
      ),
    ),
  );
}

class _ServiceShortcut extends StatelessWidget {
  const _ServiceShortcut({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 14),
        child: Column(
          children: [
            Icon(icon, color: KColors.primary),
            const SizedBox(height: KSpacing.sm),
            KLocalizedText(
              label,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelMedium,
            ),
          ],
        ),
      ),
    ),
  );
}

class _DashboardGrid extends StatelessWidget {
  const _DashboardGrid({
    required this.isWorker,
    required this.unreadNotifications,
  });

  final bool isWorker;
  final int unreadNotifications;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final textScale = (MediaQuery.textScalerOf(context).scale(16) / 16).clamp(
        1,
        2,
      );
      final columns = textScale >= 1.5
          ? 1
          : constraints.maxWidth >= 520
          ? 3
          : 2;
      final tileWidth =
          (constraints.maxWidth - (KSpacing.sm * (columns - 1))) / columns;
      final tileHeight = 172 + ((textScale - 1) * 132);
      return GridView.count(
        crossAxisCount: columns,
        crossAxisSpacing: KSpacing.sm,
        mainAxisSpacing: KSpacing.sm,
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
            onTap: () =>
                context.push(isWorker ? AppRoutes.jobs : AppRoutes.createJob),
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
              onTap: () => context.push(AppRoutes.publicWorkerProfile),
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
            _DashboardTile(
              icon: Icons.school_outlined,
              title: 'প্রশিক্ষণ',
              subtitle: 'ঐচ্ছিক কোর্স ও জ্ঞান পরীক্ষা',
              onTap: () => context.push(AppRoutes.training),
            ),
            _DashboardTile(
              icon: Icons.notifications_active_outlined,
              title: 'কাজের সতর্কতা',
              subtitle: 'মিলে যাওয়া নতুন কাজের খবর পান',
              onTap: () => context.push(AppRoutes.jobAlerts),
            ),
          ],
          _DashboardTile(
            icon: Icons.help_outline_rounded,
            title: 'সহায়তা কেন্দ্র',
            subtitle: 'সাধারণ প্রশ্নের উত্তর',
            onTap: () => context.push(AppRoutes.help),
          ),
          _DashboardTile(
            icon: Icons.settings_outlined,
            title: 'সেটিংস',
            subtitle: 'অ্যাকাউন্ট ও নিরাপত্তা',
            onTap: () => context.push(AppRoutes.settings),
          ),
        ],
      );
    },
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
      // No card margin: the grid already spaces the tiles, and the margin
      // left a dead strip round each tile where a tap did nothing.
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    CircleAvatar(
                      radius: 21,
                      backgroundColor: KColors.surfaceAlt,
                      foregroundColor: KColors.primary,
                      child: Icon(icon, size: 22),
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
                const SizedBox(height: 10),
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
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HomeNavigation extends StatelessWidget {
  const _HomeNavigation({required this.isWorker});

  final bool isWorker;

  @override
  Widget build(BuildContext context) => NavigationBar(
    selectedIndex: 0,
    onDestinationSelected: (index) {
      switch (index) {
        case 1:
          context.push(AppRoutes.explore);
        case 2:
          context.push(AppRoutes.activity);
        case 3:
          context.push(AppRoutes.conversations);
        case 4:
          context.push(AppRoutes.settings);
      }
    },
    destinations: [
      NavigationDestination(
        icon: const Icon(Icons.home_outlined),
        selectedIcon: const Icon(Icons.home_rounded, color: KColors.primary),
        label: KaajLocalizations.text(context, 'হোম'),
      ),
      NavigationDestination(
        icon: const Icon(Icons.travel_explore),
        label: KaajLocalizations.text(context, 'খুঁজুন'),
      ),
      NavigationDestination(
        icon: const Icon(Icons.handshake_outlined),
        label: KaajLocalizations.text(context, 'আমার কার্যক্রম'),
      ),
      NavigationDestination(
        icon: const Icon(Icons.chat_bubble_outline),
        label: KaajLocalizations.text(context, 'বার্তা'),
      ),
      NavigationDestination(
        icon: const Icon(Icons.person_outline),
        label: KaajLocalizations.text(context, 'প্রোফাইল'),
      ),
    ],
  );
}

String _banglaNumber(int value) => value.toString().replaceAllMapped(
  RegExp(r'\d'),
  (match) => '০১২৩৪৫৬৭৮৯'[int.parse(match.group(0)!)],
);

class _PopularCategories extends ConsumerWidget {
  const _PopularCategories({required this.language});

  final String language;

  static const _icons = <String, IconData>{
    'cleaning': Icons.cleaning_services_outlined,
    'home': Icons.home_repair_service_outlined,
    'repair': Icons.handyman_outlined,
    'school': Icons.school_outlined,
    'education': Icons.school_outlined,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = [...?ref.watch(categoryTreeProvider).valueOrNull]
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    if (categories.isEmpty) return const SizedBox.shrink();
    final top = categories.take(3).toList(growable: false);
    return Row(
      children: [
        for (final (index, category) in top.indexed) ...[
          if (index > 0) const SizedBox(width: KSpacing.sm),
          Expanded(
            child: _ServiceShortcut(
              icon:
                  _icons[category.icon] ??
                  _icons[category.slug] ??
                  Icons.work_outline,
              label: category.nameFor(language),
              onTap: () => context.push(
                AppRoutes.jobsForType(
                  categoryId: category.id,
                  categoryName: category.nameFor(language),
                ),
              ),
            ),
          ),
        ],
        for (var index = top.length; index < 3; index++) ...[
          const SizedBox(width: KSpacing.sm),
          const Expanded(child: SizedBox.shrink()),
        ],
      ],
    );
  }
}

/// What a screen reader says for the bell.
String bellSemanticsLabel(BuildContext context, int unread) {
  final title = KaajLocalizations.text(context, 'নোটিফিকেশন');
  if (unread <= 0) return title;
  return KaajLocalizations.isEnglish(context)
      ? '$title, $unread unread'
      : '$title, ${_banglaNumber(unread)}টি অপঠিত';
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_error_state.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../ai/presentation/ai_suggestions.dart';
import '../../../catalog/presentation/controllers/catalog_providers.dart';
import '../../../community/presentation/community_providers.dart';
import '../../../jobs/presentation/controllers/jobs_providers.dart';
import '../../../notifications/presentation/controllers/notifications_providers.dart';
import '../../../profile/presentation/controllers/me_provider.dart';
import '../../../profile/presentation/controllers/my_profile_provider.dart';
import '../../../profile/presentation/widgets/profile_completeness_card.dart';
import '../../../training/presentation/widgets/my_training_card.dart';
import '../../../training/presentation/widgets/training_offer_gate.dart';
import '../widgets/home_hub_widgets.dart';

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
          child: RefreshIndicator(
            onRefresh: () async {
              refreshMe(ref);
              ref
                ..invalidate(notificationsProvider)
                ..invalidate(myProfileProvider)
                ..invalidate(sessionsProvider('attending'))
                ..invalidate(jobFeedProvider(homeJobFilter));
              try {
                ref.invalidate(assignmentsProvider);
                await ref.read(assignmentsProvider.future);
              } on Object {
                // Each section shows its own state; nothing to add here.
              }
            },
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
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
                      if (!isWorker) ...[
                        KLocalizedText(
                          'কী কাজ করাতে চান?',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: KSpacing.sm),
                      ],
                      HomeSearchBar(
                        label: isWorker ? 'কাজ অনুসন্ধান' : 'সেবা খুঁজুন',
                        onTap: () => context.push(
                          isWorker ? AppRoutes.jobs : AppRoutes.workers,
                        ),
                      ),
                      if (!isWorker) ...[
                        const SizedBox(height: 12),
                        _PostJobCard(
                          onTap: () => context.push(AppRoutes.createJob),
                        ),
                      ],
                      const SizedBox(height: 12),
                      HomeStatsRow(
                        isWorker: isWorker,
                        unreadNotifications: unreadNotifications,
                      ),
                      const SizedBox(height: 12),
                      const HomePillarGrid(),
                      const HomeComingUp(),
                      if (isWorker) ...[
                        const SizedBox(height: KSpacing.sm),
                        const ProfileCompletenessCard(compact: true),
                        const SizedBox(height: KSpacing.sm),
                        HomeJobsForYou(nearYouRoute: nearYou),
                        // Hidden unless KAAJ AI is on.
                        const AiSuggestionsCard(),
                        const SizedBox(height: KSpacing.sm),
                        const MyTrainingCard(),
                      ] else ...[
                        // Hidden unless KAAJ AI is on.
                        const AiSuggestionsCard(),
                        const SizedBox(height: KSpacing.md),
                        _SectionHeader(
                          title: 'জনপ্রিয় সেবা',
                          onTap: () => context.push(AppRoutes.categories),
                        ),
                        const SizedBox(height: KSpacing.sm),
                        // Real categories from the catalog, each opening its
                        // own posts.
                        _PopularCategories(language: language),
                      ],
                      const SizedBox(height: KSpacing.lg),
                      const _SectionHeader(title: 'দ্রুত যান'),
                      const SizedBox(height: KSpacing.sm),
                      HomeShortcuts(isWorker: isWorker),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The customer's main action, as one wide card.
class _PostJobCard extends StatelessWidget {
  const _PostJobCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    color: KColors.primary,
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            const CircleAvatar(
              backgroundColor: KColors.primaryDark,
              foregroundColor: KColors.secondary,
              child: Icon(Icons.post_add_outlined),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  KLocalizedText(
                    'কাজ পোস্ট করুন',
                    style: Theme.of(
                      context,
                    ).textTheme.titleMedium?.copyWith(color: KColors.onPrimary),
                  ),
                  KLocalizedText(
                    'সময়সহ নতুন কাজ দিন',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: KColors.onPrimary),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: KColors.onPrimary),
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
        label: KaajLocalizations.text(context, 'কার্যক্রম'),
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

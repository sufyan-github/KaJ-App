import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../catalog/domain/entities/catalog_category.dart';
import '../../../catalog/domain/entities/catalog_skill.dart';
import '../../../catalog/presentation/controllers/catalog_providers.dart';
import '../controllers/public_profile_provider.dart';

class CategoriesBrowseScreen extends ConsumerWidget {
  const CategoriesBrowseScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoryTreeProvider);
    final skills = ref.watch(catalogSkillsProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('কাজের ধরন')),
      body: categories.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => _CatalogState(
          icon: Icons.cloud_off_outlined,
          message: 'কাজের ধরন লোড করা যায়নি।',
          onRetry: () => ref.invalidate(categoryTreeProvider),
        ),
        data: (items) => skills.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => _CatalogState(
            icon: Icons.cloud_off_outlined,
            message: 'কাজের উপধরন লোড করা যায়নি।',
            onRetry: () => ref.invalidate(catalogSkillsProvider),
          ),
          data: (allSkills) => items.isEmpty
              ? _CatalogState(
                  icon: Icons.category_outlined,
                  message: 'এখনো কোনো কাজের ধরন যোগ করা হয়নি।',
                  onRetry: () {
                    ref.invalidate(categoryTreeProvider);
                    ref.invalidate(catalogSkillsProvider);
                  },
                )
              : _CategoryGrid(categories: items, skills: allSkills),
        ),
      ),
    );
  }
}

class _CatalogState extends StatelessWidget {
  const _CatalogState({
    required this.icon,
    required this.message,
    required this.onRetry,
  });

  final IconData icon;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: KColors.primary.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: KColors.primary, size: 32),
          ),
          const SizedBox(height: KSpacing.md),
          KLocalizedText(message, textAlign: TextAlign.center),
          const SizedBox(height: KSpacing.md),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const KLocalizedText('আবার চেষ্টা করুন'),
          ),
        ],
      ),
    ),
  );
}

class _CategoryGrid extends StatelessWidget {
  const _CategoryGrid({required this.categories, required this.skills});

  final List<CatalogCategory> categories;
  final List<CatalogSkill> skills;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final textScale = (MediaQuery.textScalerOf(context).scale(16) / 16).clamp(
        1,
        2,
      );
      final columns = textScale >= 1.5 && constraints.maxWidth < 680
          ? 1
          : constraints.maxWidth >= 680
          ? 3
          : 2;
      return GridView.builder(
        padding: const EdgeInsets.all(KSpacing.md),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: columns,
          crossAxisSpacing: KSpacing.md,
          mainAxisSpacing: KSpacing.md,
          mainAxisExtent: 174 + ((textScale - 1) * (columns == 1 ? 90 : 180)),
        ),
        itemCount: categories.length,
        itemBuilder: (context, index) {
          final category = categories[index];
          final subtypes = skills
              .where((skill) => skill.categoryId == category.id)
              .toList(growable: false);
          return Card(
            margin: EdgeInsets.zero,
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () => _showSubtypes(context, category, subtypes),
              child: Padding(
                padding: const EdgeInsets.all(KSpacing.md),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        color: KColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(
                        _categoryIcon(category.icon),
                        color: KColors.primary,
                      ),
                    ),
                    const SizedBox(height: KSpacing.md),
                    KLocalizedText(
                      category.nameFor(
                        Localizations.localeOf(context).languageCode,
                      ),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: KSpacing.xs),
                    KLocalizedText(
                      '${_banglaDigits(subtypes.length)}টি উপধরন',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: KColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      );
    },
  );

  void _showSubtypes(
    BuildContext context,
    CatalogCategory category,
    List<CatalogSkill> subtypes,
  ) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            KSpacing.lg,
            0,
            KSpacing.lg,
            KSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              KLocalizedText(
                category.nameFor(
                  Localizations.localeOf(sheetContext).languageCode,
                ),
                style: Theme.of(sheetContext).textTheme.titleLarge,
              ),
              KLocalizedText(
                'কাজের উপধরন বেছে নিন',
                style: Theme.of(
                  sheetContext,
                ).textTheme.bodyLarge?.copyWith(color: KColors.textSecondary),
              ),
              const SizedBox(height: KSpacing.md),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () {
                    Navigator.pop(sheetContext);
                    context.push(
                      AppRoutes.jobsForType(
                        categoryId: category.id,
                        categoryName: category.nameFor(
                          Localizations.localeOf(context).languageCode,
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.manage_search),
                  label: KLocalizedText(
                    '${category.nameFor(Localizations.localeOf(sheetContext).languageCode)}-এর সব কাজ দেখুন',
                  ),
                ),
              ),
              const SizedBox(height: KSpacing.md),
              if (subtypes.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: KSpacing.xl),
                  child: Center(
                    child: KLocalizedText('এখনো কোনো উপধরন যোগ করা হয়নি।'),
                  ),
                )
              else
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: KSpacing.sm,
                    mainAxisSpacing: KSpacing.sm,
                    mainAxisExtent:
                        72 +
                        (((MediaQuery.textScalerOf(sheetContext).scale(16) / 16)
                                    .clamp(1, 2) -
                                1) *
                            40),
                  ),
                  itemCount: subtypes.length,
                  itemBuilder: (itemContext, index) {
                    final subtype = subtypes[index];
                    return Card(
                      margin: EdgeInsets.zero,
                      color: KColors.surfaceAlt,
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () {
                          Navigator.pop(sheetContext);
                          context.push(
                            AppRoutes.jobsForType(
                              categoryId: category.id,
                              categoryName: category.nameFor(
                                Localizations.localeOf(
                                  itemContext,
                                ).languageCode,
                              ),
                              skillId: subtype.id,
                              skillName: subtype.nameFor(
                                Localizations.localeOf(
                                  itemContext,
                                ).languageCode,
                              ),
                            ),
                          );
                        },
                        child: Center(
                          child: Padding(
                            padding: const EdgeInsets.all(KSpacing.sm),
                            child: KLocalizedText(
                              subtype.nameFor(
                                Localizations.localeOf(
                                  itemContext,
                                ).languageCode,
                              ),
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }
}

IconData _categoryIcon(String? icon) => switch (icon) {
  'home' => Icons.home_repair_service_outlined,
  'tools' => Icons.handyman_outlined,
  'care' => Icons.volunteer_activism_outlined,
  'transport' => Icons.local_shipping_outlined,
  'education' => Icons.school_outlined,
  'computer' => Icons.computer_outlined,
  'event' => Icons.celebration_outlined,
  _ => Icons.work_outline,
};

String _banglaDigits(int value) => value.toString().replaceAllMapped(
  RegExp(r'\d'),
  (match) => '০১২৩৪৫৬৭৮৯'[int.parse(match.group(0)!)],
);

class PublicWorkerProfileScreen extends ConsumerWidget {
  const PublicWorkerProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myPublicWorkerProfileProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('কর্মীর পাবলিক প্রোফাইল')),
      body: profile.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: FilledButton(
            onPressed: () => ref.invalidate(myPublicWorkerProfileProvider),
            child: const KLocalizedText('আবার চেষ্টা করুন'),
          ),
        ),
        data: (value) => ListView(
          padding: const EdgeInsets.all(KSpacing.lg),
          children: [
            CircleAvatar(
              radius: 44,
              foregroundImage: value.photoUrl == null
                  ? null
                  : NetworkImage(value.photoUrl!),
              child: const Icon(Icons.person, size: 48),
            ),
            const SizedBox(height: KSpacing.md),
            Text(
              value.displayName,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (value.areaNameFor(
                  Localizations.localeOf(context).languageCode,
                ) !=
                null)
              KLocalizedText(
                value.areaNameFor(
                  Localizations.localeOf(context).languageCode,
                )!,
                textAlign: TextAlign.center,
              ),
            const SizedBox(height: KSpacing.sm),
            KLocalizedText(
              '${value.completedJobsCount}টি কাজ · রেটিং ${value.ratingAverage} (${value.ratingCount})',
              textAlign: TextAlign.center,
            ),
            if (value.badges.isNotEmpty) ...[
              const SizedBox(height: KSpacing.sm),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: KSpacing.sm,
                children: value.badges
                    .map(
                      (badge) => Chip(
                        avatar: const Icon(Icons.workspace_premium, size: 16),
                        label: KLocalizedText(
                          badge.nameFor(
                            Localizations.localeOf(context).languageCode,
                          ),
                        ),
                      ),
                    )
                    .toList(growable: false),
              ),
            ],
            const SizedBox(height: KSpacing.md),
            Wrap(
              spacing: KSpacing.sm,
              children: value.skills
                  .map(
                    (skill) => Chip(
                      avatar: skill.isVerified
                          ? const Icon(Icons.verified, size: 16)
                          : null,
                      label: KLocalizedText(
                        skill.nameFor(
                          Localizations.localeOf(context).languageCode,
                        ),
                      ),
                    ),
                  )
                  .toList(growable: false),
            ),
            const Card(
              child: ListTile(
                leading: Icon(Icons.verified_user_outlined),
                title: KLocalizedText('ফোন যাচাই করা হয়েছে'),
                subtitle: KLocalizedText(
                  'শুধু যাচাই করা তথ্যই এখানে দেখানো হয়।',
                ),
              ),
            ),
            const Card(
              child: ListTile(
                leading: Icon(Icons.lock_outline),
                title: KLocalizedText('ব্যক্তিগত তথ্য সুরক্ষিত'),
                subtitle: KLocalizedText(
                  'ফোন নম্বর, সঠিক ঠিকানা ও নথি প্রকাশ করা হয় না।',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class HelpSafetyScreen extends StatelessWidget {
  const HelpSafetyScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const KLocalizedText('সহায়তা ও নিরাপত্তা')),
    body: ListView(
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        const Card(
          color: KColors.surfaceAlt,
          child: ListTile(
            leading: Icon(Icons.emergency_outlined, color: KColors.danger),
            title: KLocalizedText('তাৎক্ষণিক বিপদে ৯৯৯'),
            subtitle: KLocalizedText(
              'KAAJ জরুরি সেবা নয়। নিরাপদ স্থানে যান এবং জাতীয় জরুরি সেবায় কল করুন।',
            ),
          ),
        ),
        const ListTile(
          leading: Icon(Icons.shield_outlined),
          title: KLocalizedText('ব্যক্তিগত তথ্য শেয়ার করবেন না'),
          subtitle: KLocalizedText(
            'চ্যাটে জাতীয় পরিচয়পত্র, পিন বা ওটিপি দেবেন না।',
          ),
        ),
        const ListTile(
          leading: Icon(Icons.payments_outlined),
          title: KLocalizedText('কাজ ও পারিশ্রমিক আগে নিশ্চিত করুন'),
          subtitle: KLocalizedText(
            'কাজের পরিধি, সময় ও টাকার পরিমাণ লিখিত রাখুন।',
          ),
        ),
        const ListTile(
          leading: Icon(Icons.report_outlined),
          title: KLocalizedText('সমস্যা হলে রিপোর্ট করুন'),
          subtitle: KLocalizedText(
            'জরুরি বিপদে স্থানীয় জরুরি সেবার সঙ্গে যোগাযোগ করুন।',
          ),
        ),
        const Divider(),
        ExpansionTile(
          leading: const Icon(Icons.home_work_outlined),
          title: const KLocalizedText('বাসা বা ব্যক্তিগত স্থানে কাজ'),
          children: const [
            ListTile(
              title: KLocalizedText(
                'আগে পরিচয় যাচাই দেখুন, বিশ্বস্ত কাউকে সময়-ঠিকানা জানান এবং প্রথম সাক্ষাতে একা না থাকুন।',
              ),
            ),
          ],
        ),
        ExpansionTile(
          leading: const Icon(Icons.payments_outlined),
          title: const KLocalizedText('টাকা ও প্রতারণা থেকে সুরক্ষা'),
          children: const [
            ListTile(
              title: KLocalizedText(
                'OTP, PIN বা আগাম ব্যক্তিগত ট্রান্সফার দেবেন না। চুক্তি ও বার্তা KAAJ-এর ভেতরে রাখুন।',
              ),
            ),
          ],
        ),
        ExpansionTile(
          leading: const Icon(Icons.engineering_outlined),
          title: const KLocalizedText('শারীরিক কাজের নিরাপত্তা'),
          children: const [
            ListTile(
              title: KLocalizedText(
                'প্রয়োজনীয় সরঞ্জাম ব্যবহার করুন। কাজের পরিবেশ অনিরাপদ হলে কাজ থামিয়ে রিপোর্ট করুন।',
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

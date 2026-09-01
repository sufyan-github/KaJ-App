import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
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
      appBar: AppBar(title: const Text('কাজের ধরন')),
      body: categories.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const Center(child: Text('তালিকা লোড করা যায়নি।')),
        data: (items) => skills.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) =>
              const Center(child: Text('উপধরনের তালিকা লোড করা যায়নি।')),
          data: (allSkills) =>
              _CategoryGrid(categories: items, skills: allSkills),
        ),
      ),
    );
  }
}

class _CategoryGrid extends StatelessWidget {
  const _CategoryGrid({required this.categories, required this.skills});

  final List<CatalogCategory> categories;
  final List<CatalogSkill> skills;

  @override
  Widget build(BuildContext context) => GridView.builder(
    padding: const EdgeInsets.all(KSpacing.md),
    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 2,
      crossAxisSpacing: KSpacing.md,
      mainAxisSpacing: KSpacing.md,
      childAspectRatio: 1.12,
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
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: KColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    _categoryIcon(category.icon),
                    color: KColors.primary,
                  ),
                ),
                const Spacer(),
                Text(
                  category.nameBn,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: KSpacing.xs),
                Text(
                  '${subtypes.length}টি উপধরন',
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

  void _showSubtypes(
    BuildContext context,
    CatalogCategory category,
    List<CatalogSkill> subtypes,
  ) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
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
              Text(
                category.nameBn,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              Text(
                'কাজের উপধরন বেছে নিন',
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(color: KColors.textSecondary),
              ),
              const SizedBox(height: KSpacing.md),
              if (subtypes.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: KSpacing.xl),
                  child: Center(child: Text('এখনো কোনো উপধরন যোগ করা হয়নি।')),
                )
              else
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: KSpacing.sm,
                    mainAxisSpacing: KSpacing.sm,
                    childAspectRatio: 2.4,
                  ),
                  itemCount: subtypes.length,
                  itemBuilder: (context, index) => Card(
                    margin: EdgeInsets.zero,
                    color: KColors.surfaceAlt,
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(KSpacing.sm),
                        child: Text(
                          subtypes[index].nameBn,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ),
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

class PublicWorkerProfileScreen extends ConsumerWidget {
  const PublicWorkerProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myPublicWorkerProfileProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('কর্মীর পাবলিক প্রোফাইল')),
      body: profile.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: FilledButton(
            onPressed: () => ref.invalidate(myPublicWorkerProfileProvider),
            child: const Text('আবার চেষ্টা করুন'),
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
            if (value.areaNameBn != null)
              Text(value.areaNameBn!, textAlign: TextAlign.center),
            const SizedBox(height: KSpacing.sm),
            Text(
              '${value.completedJobsCount}টি কাজ · রেটিং ${value.ratingAverage} (${value.ratingCount})',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: KSpacing.md),
            Wrap(
              spacing: KSpacing.sm,
              children: value.skills
                  .map(
                    (skill) => Chip(
                      avatar: skill.isVerified
                          ? const Icon(Icons.verified, size: 16)
                          : null,
                      label: Text(skill.nameBn),
                    ),
                  )
                  .toList(growable: false),
            ),
            const Card(
              child: ListTile(
                leading: Icon(Icons.verified_user_outlined),
                title: Text('ফোন যাচাই করা হয়েছে'),
                subtitle: Text('শুধু যাচাই করা তথ্যই এখানে দেখানো হয়।'),
              ),
            ),
            const Card(
              child: ListTile(
                leading: Icon(Icons.lock_outline),
                title: Text('ব্যক্তিগত তথ্য সুরক্ষিত'),
                subtitle: Text(
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

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('সেটিংস')),
    body: ListView(
      children: [
        const ListTile(
          leading: Icon(Icons.language),
          title: Text('ভাষা'),
          subtitle: Text('বাংলা'),
        ),
        SwitchListTile(
          value: true,
          onChanged: (_) {},
          secondary: const Icon(Icons.notifications_outlined),
          title: const Text('নোটিফিকেশন'),
        ),
        const ListTile(
          leading: Icon(Icons.privacy_tip_outlined),
          title: Text('গোপনীয়তা'),
          subtitle: Text('আপনার তথ্য কীভাবে ব্যবহার হয় দেখুন'),
        ),
        ListTile(
          leading: const Icon(Icons.help_outline),
          title: const Text('সহায়তা ও নিরাপত্তা'),
          onTap: () => context.push(AppRoutes.helpSafety),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.delete_outline, color: KColors.danger),
          title: const Text('অ্যাকাউন্ট মুছুন'),
          subtitle: const Text(
            'অনুরোধের আগে প্রভাব ও অপেক্ষার সময় দেখানো হবে',
          ),
          onTap: () => showDialog<void>(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('অ্যাকাউন্ট মুছবেন?'),
              content: const Text(
                'এই পর্যায়ে মুছে ফেলার অনুরোধ চালু নয়। সহায়তা দলের সঙ্গে যোগাযোগ করুন।',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('ঠিক আছে'),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

class HelpSafetyScreen extends StatelessWidget {
  const HelpSafetyScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('সহায়তা ও নিরাপত্তা')),
    body: ListView(
      padding: const EdgeInsets.all(KSpacing.md),
      children: const [
        ListTile(
          leading: Icon(Icons.shield_outlined),
          title: Text('ব্যক্তিগত তথ্য শেয়ার করবেন না'),
          subtitle: Text('চ্যাটে জাতীয় পরিচয়পত্র, পিন বা ওটিপি দেবেন না।'),
        ),
        ListTile(
          leading: Icon(Icons.payments_outlined),
          title: Text('কাজ ও পারিশ্রমিক আগে নিশ্চিত করুন'),
          subtitle: Text('কাজের পরিধি, সময় ও টাকার পরিমাণ লিখিত রাখুন।'),
        ),
        ListTile(
          leading: Icon(Icons.report_outlined),
          title: Text('সমস্যা হলে রিপোর্ট করুন'),
          subtitle: Text(
            'জরুরি বিপদে স্থানীয় জরুরি সেবার সঙ্গে যোগাযোগ করুন।',
          ),
        ),
      ],
    ),
  );
}

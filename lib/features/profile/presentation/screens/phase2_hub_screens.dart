import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../catalog/presentation/controllers/catalog_providers.dart';
import '../../../onboarding/presentation/controllers/onboarding_controller.dart';

class CategoriesBrowseScreen extends ConsumerWidget {
  const CategoriesBrowseScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoryTreeProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('কাজের ধরন')),
      body: categories.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const Center(child: Text('তালিকা লোড করা যায়নি।')),
        data: (items) => ListView.builder(
          padding: const EdgeInsets.all(KSpacing.md),
          itemCount: items.length,
          itemBuilder: (context, index) {
            final item = items[index];
            return ExpansionTile(
              leading: const Icon(Icons.work_outline, color: KColors.primary),
              title: Text(item.nameBn),
              subtitle: Text(item.nameEn),
              children: item.children
                  .map(
                    (child) => ListTile(
                      contentPadding: const EdgeInsets.only(
                        left: 56,
                        right: 16,
                      ),
                      title: Text(child.nameBn),
                      subtitle: Text(child.nameEn),
                    ),
                  )
                  .toList(growable: false),
            );
          },
        ),
      ),
    );
  }
}

class PublicWorkerProfileScreen extends ConsumerWidget {
  const PublicWorkerProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(onboardingControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('কর্মীর পাবলিক প্রোফাইল')),
      body: ListView(
        padding: const EdgeInsets.all(KSpacing.lg),
        children: [
          const CircleAvatar(radius: 44, child: Icon(Icons.person, size: 48)),
          const SizedBox(height: KSpacing.md),
          Text(
            profile.displayName.isEmpty
                ? 'কাজ ব্যবহারকারী'
                : profile.displayName,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: KSpacing.sm),
          Text(
            '${profile.skillIds.length}টি দক্ষতা যোগ করা হয়েছে',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: KSpacing.md),
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
              subtitle: Text('ফোন নম্বর, সঠিক ঠিকানা ও নথি প্রকাশ করা হয় না।'),
            ),
          ),
        ],
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

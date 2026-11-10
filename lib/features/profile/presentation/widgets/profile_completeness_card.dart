import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_card.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../domain/my_profile.dart';
import '../controllers/my_profile_provider.dart';

({String label, IconData icon, String route}) completenessAction(
  CompletenessItem item,
) => switch (item) {
  CompletenessItem.photo => (
    label: 'প্রোফাইল ছবি যোগ করুন',
    icon: Icons.add_a_photo_outlined,
    route: AppRoutes.editProfile,
  ),
  CompletenessItem.bio => (
    label: 'নিজের সম্পর্কে ছোট করে লিখুন',
    icon: Icons.notes_outlined,
    route: AppRoutes.editProfile,
  ),
  CompletenessItem.area => (
    label: 'আপনার এলাকা বেছে নিন',
    icon: Icons.location_on_outlined,
    route: AppRoutes.editProfile,
  ),
  CompletenessItem.skills => (
    label: 'আপনার দক্ষতা যোগ করুন',
    icon: Icons.handyman_outlined,
    route: AppRoutes.editWorkerSkills,
  ),
  CompletenessItem.identity => (
    label: 'পরিচয় যাচাই করুন',
    icon: Icons.verified_user_outlined,
    route: AppRoutes.verification,
  ),
  CompletenessItem.training || CompletenessItem.unknown => (
    label: 'একটি ঐচ্ছিক প্রশিক্ষণ পরীক্ষা দিন',
    icon: Icons.school_outlined,
    route: AppRoutes.training,
  ),
};

/// Profile completeness from the server, with each missing piece as a row
/// that opens the screen where it can be fixed. Hidden once complete.
class ProfileCompletenessCard extends ConsumerWidget {
  const ProfileCompletenessCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref
        .watch(myProfileProvider)
        .maybeWhen(data: (value) => value, orElse: () => null);
    if (profile == null || profile.completeness.isComplete) {
      return const SizedBox.shrink();
    }
    final completeness = profile.completeness;
    final percent = KFormat.count(context, completeness.percent);
    final english = KaajLocalizations.isEnglish(context);
    return KCard(
      key: const ValueKey('profile-completeness'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: KLocalizedText(
                  'প্রোফাইল সম্পূর্ণ করুন',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Text(
                english ? '$percent% complete' : '$percent% সম্পূর্ণ',
                style: const TextStyle(
                  color: KColors.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: KSpacing.sm),
          ClipRRect(
            borderRadius: BorderRadius.circular(KRadius.pill),
            child: LinearProgressIndicator(
              value: completeness.percent / 100,
              minHeight: 6,
            ),
          ),
          const SizedBox(height: KSpacing.xs),
          for (final item in completeness.missing)
            Builder(
              builder: (context) {
                final action = completenessAction(item);
                return ListTile(
                  key: ValueKey('completeness-${item.name}'),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(action.icon, color: KColors.primary),
                  title: KLocalizedText(action.label),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.push(action.route),
                );
              },
            ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors/failure_copy.dart';
import '../../core/routing/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/k_empty_state.dart';
import '../../core/widgets/k_localized_text.dart';
import '../business/presentation/my_business_section.dart';
import '../community/presentation/my_community_section.dart';
import '../ideas/presentation/my_ideas_section.dart';
import '../jobs/presentation/screens/jobs_screens.dart';
import '../learning/presentation/enrolment_screens.dart';
import '../learning/presentation/learning_providers.dart';
import '../training/data/training_repository.dart';
import '../training/presentation/screens/training_catalog_screen.dart';
import '../training/presentation/training_providers.dart';

/// Sections of My activity; `?section=` uses these names.
enum ActivitySection {
  work,
  learning,
  business,
  ideas,
  community;

  static ActivitySection parse(String? value) => ActivitySection.values
      .firstWhere((item) => item.name == value, orElse: () => work);
}

/// What the person is doing across KAAJ: jobs and bookings, learning,
/// businesses, ideas and community.
class MyActivityScreen extends StatefulWidget {
  const MyActivityScreen({
    this.initialSection = ActivitySection.work,
    super.key,
  });

  final ActivitySection initialSection;

  @override
  State<MyActivityScreen> createState() => _MyActivityScreenState();
}

class _MyActivityScreenState extends State<MyActivityScreen> {
  late ActivitySection _section = widget.initialSection;

  static const _chips = [
    (ActivitySection.work, Icons.handshake_outlined, 'কাজ ও বুকিং'),
    (ActivitySection.learning, Icons.school_outlined, 'শেখা'),
    (ActivitySection.business, Icons.storefront_outlined, 'ব্যবসা-বাণিজ্য'),
    (ActivitySection.ideas, Icons.lightbulb_outline, 'আইডিয়া'),
    (ActivitySection.community, Icons.diversity_3_outlined, 'কমিউনিটি'),
  ];

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const KLocalizedText('আমার কার্যক্রম'),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(56),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(
            KSpacing.md,
            0,
            KSpacing.md,
            KSpacing.sm,
          ),
          child: Row(
            children: [
              for (final (section, icon, label) in _chips)
                Padding(
                  padding: const EdgeInsets.only(right: KSpacing.sm),
                  child: ChoiceChip(
                    key: ValueKey('activity-${section.name}'),
                    avatar: Icon(icon, size: 18),
                    label: KLocalizedText(label),
                    selected: _section == section,
                    onSelected: (_) => setState(() => _section = section),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
    body: switch (_section) {
      ActivitySection.work => const AssignmentsScreen(embedded: true),
      ActivitySection.learning => const MyLearningSection(),
      ActivitySection.business => const MyBusinessSection(),
      ActivitySection.ideas => const MyIdeasSection(),
      ActivitySection.community => const MyCommunitySection(),
    },
  );
}

/// The person's courses in progress and certificates. Learning
/// opportunities with a mentor join this list once they exist.
class MyLearningSection extends ConsumerWidget {
  const MyLearningSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final courses = ref.watch(trainingCoursesProvider(CourseScope.mine));
    Future<void> refresh() async {
      ref
        ..invalidate(trainingCoursesProvider(CourseScope.mine))
        ..invalidate(myCertificatesProvider)
        ..invalidate(learningEnrolmentsProvider)
        ..invalidate(myLearningApplicationsProvider);
      await ref
          .read(trainingCoursesProvider(CourseScope.mine).future)
          .then<void>((_) {}, onError: (_) {});
    }

    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(KSpacing.md),
        children: [
          Wrap(
            spacing: KSpacing.sm,
            runSpacing: KSpacing.sm,
            children: [
              OutlinedButton.icon(
                key: const ValueKey('activity-certificates'),
                onPressed: () => context.push(AppRoutes.trainingCertificates),
                icon: const Icon(Icons.workspace_premium_outlined),
                label: const KLocalizedText('আমার সার্টিফিকেট'),
              ),
              OutlinedButton.icon(
                key: const ValueKey('activity-explore-learn'),
                onPressed: () => context.push(AppRoutes.exploreLearn),
                icon: const Icon(Icons.travel_explore),
                label: const KLocalizedText('শেখার সুযোগ খুঁজুন'),
              ),
            ],
          ),
          const SizedBox(height: KSpacing.md),
          // Learning with a mentor, as learner or mentor.
          const MyLearningApplicationsSection(),
          const MyEnrolmentsSection(),
          ...courses.when(
            loading: () => const [
              Padding(
                padding: EdgeInsets.all(KSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              ),
            ],
            error: (error, _) => [
              Text(
                failureText(context, error, 'কোর্সের তালিকা লোড করা যায়নি।'),
              ),
              TextButton(
                onPressed: refresh,
                child: const KLocalizedText('আবার চেষ্টা করুন'),
              ),
            ],
            data: (items) => items.isEmpty
                ? const [
                    KEmptyState(
                      icon: Icons.school_outlined,
                      title: 'এখনো কিছু শেখা শুরু করেননি',
                      message: 'শেখার সুযোগ থেকে একটি কোর্স বেছে নিন।',
                    ),
                  ]
                : [for (final course in items) CourseCard(course: course)],
          ),
        ],
      ),
    );
  }
}

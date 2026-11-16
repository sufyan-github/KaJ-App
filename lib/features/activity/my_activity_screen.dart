import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors/failure_copy.dart';
import '../../core/routing/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/k_empty_state.dart';
import '../../core/widgets/k_localized_text.dart';
import '../jobs/presentation/screens/jobs_screens.dart';
import '../learning/presentation/enrolment_screens.dart';
import '../learning/presentation/learning_providers.dart';
import '../training/data/training_repository.dart';
import '../training/presentation/screens/training_catalog_screen.dart';
import '../training/presentation/training_providers.dart';

/// What the person is doing across KAAJ: jobs and bookings, and learning.
/// Replaces the old "My work" tab; more sections arrive with new domains.
class MyActivityScreen extends StatefulWidget {
  const MyActivityScreen({this.initialSection = 0, super.key});

  /// 0 = jobs and bookings, 1 = learning.
  final int initialSection;

  @override
  State<MyActivityScreen> createState() => _MyActivityScreenState();
}

class _MyActivityScreenState extends State<MyActivityScreen> {
  late int _section = widget.initialSection;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const KLocalizedText('আমার কার্যক্রম'),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(56),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            KSpacing.md,
            0,
            KSpacing.md,
            KSpacing.sm,
          ),
          child: SegmentedButton<int>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(
                value: 0,
                icon: Icon(Icons.handshake_outlined),
                label: KLocalizedText('কাজ ও বুকিং'),
              ),
              ButtonSegment(
                value: 1,
                icon: Icon(Icons.school_outlined),
                label: KLocalizedText('শেখা'),
              ),
            ],
            selected: {_section},
            onSelectionChanged: (value) =>
                setState(() => _section = value.first),
          ),
        ),
      ),
    ),
    body: _section == 0
        ? const AssignmentsScreen(embedded: true)
        : const MyLearningSection(),
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
        ..invalidate(learningEnrolmentsProvider);
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

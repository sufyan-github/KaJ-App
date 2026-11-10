import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_empty_state.dart';
import '../../../../core/widgets/k_error_state.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../data/training_repository.dart';
import '../../domain/training_models.dart';
import '../training_providers.dart';
import '../widgets/training_ui.dart';

class TrainingCatalogScreen extends ConsumerWidget {
  const TrainingCatalogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final courses = ref.watch(trainingCoursesProvider(CourseScope.all));
    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('প্রশিক্ষণ'),
        actions: [
          IconButton(
            tooltip: KaajLocalizations.text(context, 'সার্টিফিকেট'),
            onPressed: () => context.push(AppRoutes.trainingCertificates),
            icon: const Icon(Icons.workspace_premium_outlined),
          ),
        ],
      ),
      body: courses.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: KErrorState(
            failure: ErrorMapper.from(error),
            retryLabel: 'আবার চেষ্টা করুন',
            onRetry: () =>
                ref.invalidate(trainingCoursesProvider(CourseScope.all)),
          ),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: KEmptyState(
                icon: Icons.school_outlined,
                title: 'এখনো কোনো কোর্স নেই',
                message: 'নতুন কোর্স এলে এখানে দেখা যাবে।',
              ),
            );
          }
          final ordered = orderCoursesByRelevance(items);
          final children = <Widget>[
            const KLocalizedText(
              'প্রশিক্ষণ ঐচ্ছিক। কাজে আবেদন করতে কোনো কোর্স লাগে না। অভিজ্ঞ হলে সরাসরি পরীক্ষা দিতে পারেন।',
              style: TextStyle(color: KColors.textSecondary),
            ),
            const SizedBox(height: KSpacing.sm),
          ];
          CourseRelevance? section;
          for (final course in ordered) {
            if (course.relevance != section) {
              section = course.relevance;
              children.add(
                Padding(
                  padding: const EdgeInsets.only(
                    top: KSpacing.md,
                    bottom: KSpacing.xs,
                  ),
                  child: KLocalizedText(switch (section) {
                    CourseRelevance.mySkill => 'আপনার দক্ষতার কোর্স',
                    CourseRelevance.general => 'সব কর্মীর জন্য',
                    CourseRelevance.other => 'অন্যান্য কোর্স',
                  }, style: Theme.of(context).textTheme.titleMedium),
                ),
              );
            }
            children.add(CourseCard(course: course));
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(trainingCoursesProvider(CourseScope.all));
              await ref.read(trainingCoursesProvider(CourseScope.all).future);
            },
            child: ListView(
              padding: const EdgeInsets.all(KSpacing.md),
              children: children,
            ),
          );
        },
      ),
    );
  }
}

class CourseCard extends StatelessWidget {
  const CourseCard({required this.course, super.key});

  final CourseSummary course;

  @override
  Widget build(BuildContext context) {
    final language = languageOf(context);
    return Card(
      key: ValueKey('course-${course.id}'),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push(AppRoutes.trainingCourse(course.id)),
        child: Padding(
          padding: const EdgeInsets.all(KSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                course.titleFor(language),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (course.skill != null)
                Text(
                  course.skill!.nameFor(language),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              const SizedBox(height: KSpacing.xs),
              CourseMetaLine(course: course),
              const SizedBox(height: KSpacing.sm),
              CertificateStateLine(course: course),
            ],
          ),
        ),
      ),
    );
  }
}

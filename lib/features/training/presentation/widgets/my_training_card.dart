import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_card.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../data/training_repository.dart';
import '../../domain/training_models.dart';
import '../training_providers.dart';
import 'training_ui.dart';

/// The worker home summary of optional training.
///
/// It counts certificates (earned only by passing a test) and the courses
/// that match the worker skills. Lessons opened are never counted here.
class MyTrainingCard extends ConsumerWidget {
  const MyTrainingCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final certificates = ref
        .watch(myCertificatesProvider)
        .maybeWhen(
          data: (items) => items.where((item) => item.isValid).length,
          orElse: () => null,
        );
    final courses = ref
        .watch(trainingCoursesProvider(CourseScope.mine))
        .maybeWhen(data: (items) => items, orElse: () => null);
    final next = courses
        ?.where((course) => !course.hasCertificate)
        .toList(growable: false);
    final ordered = next == null ? null : orderCoursesByRelevance(next);
    final upcoming = ordered == null || ordered.isEmpty ? null : ordered.first;
    final english = KaajLocalizations.isEnglish(context);
    return KCard(
      key: const ValueKey('my-training-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.school_outlined, color: KColors.primary),
              const SizedBox(width: KSpacing.sm),
              Expanded(
                child: KLocalizedText(
                  'আমার প্রশিক্ষণ',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              TextButton(
                onPressed: () => context.push(AppRoutes.training),
                child: const KLocalizedText('সব দেখুন'),
              ),
            ],
          ),
          if (certificates != null && courses != null) ...[
            Text(
              english
                  ? 'Certificates earned: ${KFormat.count(context, certificates)} · Courses for your skills: ${KFormat.count(context, courses.length)}'
                  : 'অর্জিত সার্টিফিকেট: ${KFormat.count(context, certificates)} · আপনার দক্ষতার কোর্স: ${KFormat.count(context, courses.length)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: KSpacing.sm),
          ] else
            const KLocalizedText(
              'ঐচ্ছিক কোর্স ও জ্ঞান পরীক্ষা',
              style: TextStyle(color: KColors.textSecondary),
            ),
          if (upcoming != null) ...[
            Text(
              upcoming.titleFor(languageOf(context)),
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: KSpacing.xs),
            FilledButton.icon(
              key: const ValueKey('continue-training'),
              onPressed: () =>
                  context.push(AppRoutes.trainingCourse(upcoming.id)),
              icon: const Icon(Icons.play_arrow_rounded),
              label: const KLocalizedText('চালিয়ে যান'),
            ),
          ],
          if (certificates != null && certificates > 0)
            TextButton.icon(
              onPressed: () => context.push(AppRoutes.trainingCertificates),
              icon: const Icon(Icons.workspace_premium_outlined),
              label: const KLocalizedText('আমার সার্টিফিকেট'),
            ),
        ],
      ),
    );
  }
}

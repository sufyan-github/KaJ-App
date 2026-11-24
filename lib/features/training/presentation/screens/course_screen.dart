import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_error_state.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../domain/training_models.dart';
import '../training_providers.dart';
import '../widgets/training_ui.dart';

class CourseScreen extends ConsumerStatefulWidget {
  const CourseScreen({required this.courseId, super.key});

  final String courseId;

  @override
  ConsumerState<CourseScreen> createState() => _CourseScreenState();
}

class _CourseScreenState extends ConsumerState<CourseScreen> {
  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(courseDetailProvider(widget.courseId));
    return Scaffold(
      appBar: AppBar(
        title: detail.maybeWhen(
          data: (value) => Text(
            value.summary.titleFor(languageOf(context)),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          orElse: () => const KLocalizedText('কোর্স'),
        ),
      ),
      bottomNavigationBar: detail.maybeWhen(
        data: (value) => _TestBar(detail: value),
        orElse: () => null,
      ),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: KErrorState(
            failure: ErrorMapper.from(error),
            retryLabel: 'আবার চেষ্টা করুন',
            onRetry: () =>
                ref.invalidate(courseDetailProvider(widget.courseId)),
          ),
        ),
        data: (value) => _body(context, value),
      ),
    );
  }

  Widget _body(BuildContext context, CourseDetail detail) {
    final course = detail.summary;
    final language = languageOf(context);
    final english = KaajLocalizations.isEnglish(context);
    final passMark = KFormat.count(context, course.passMarkPct);
    final questions = KFormat.count(context, course.questionCount);
    return ListView(
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        Text(
          course.titleFor(language),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: KSpacing.xs),
        Text(course.summaryFor(language)),
        const SizedBox(height: KSpacing.sm),
        CourseMetaLine(course: course),
        const SizedBox(height: KSpacing.xs),
        Text(
          english
              ? '$questions questions · pass mark $passMark%'
              : '$questionsটি প্রশ্ন · পাস নম্বর $passMark%',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        if (course.isSafetyCritical) ...[
          const SizedBox(height: KSpacing.sm),
          const _SafetyNote(),
        ],
        const SizedBox(height: KSpacing.sm),
        CertificateStateLine(course: course),
        const SizedBox(height: KSpacing.lg),
        KLocalizedText('পাঠ', style: Theme.of(context).textTheme.titleMedium),
        // In a locked-order (safety) course there is no skipping straight
        // to the test, so that hint goes.
        KLocalizedText(
          detail.lockedOrder
              ? 'পাঠগুলো ক্রমানুসারে খোলে। প্রতিটি পাঠের শেষের প্রশ্নগুলো ঠিক হলে পরের পাঠ খুলবে, আর সব পাঠ শেষ হলে পরীক্ষা।'
              : 'পাঠ খোলার টিক শুধু আপনার নিজের হিসাবের জন্য। অভিজ্ঞ হলে পাঠ বাদ দিয়ে সরাসরি পরীক্ষা দিন।',
          key: const ValueKey('lessons-hint'),
          style: const TextStyle(color: KColors.textSecondary),
        ),
        if (detail.checkpointLessons > 0) ...[
          const SizedBox(height: KSpacing.xs),
          Text(
            '${KaajLocalizations.text(context, 'প্রশ্ন শেষ হওয়া পাঠ:')} '
            '${KFormat.count(context, detail.checkpointsPassed)} / '
            '${KFormat.count(context, detail.checkpointLessons)}',
            key: const ValueKey('checkpoint-progress'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
        const SizedBox(height: KSpacing.sm),
        for (final lesson in detail.lessons)
          _LessonTile(
            lesson: lesson,
            onOpen: () =>
                context.push(AppRoutes.trainingLesson(course.id, lesson.id)),
          ),
        const SizedBox(height: KSpacing.xl),
      ],
    );
  }
}

class _SafetyNote extends StatelessWidget {
  const _SafetyNote();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(KSpacing.sm),
    decoration: BoxDecoration(
      color: KColors.warning.withValues(alpha: .10),
      borderRadius: BorderRadius.circular(KRadius.sm),
      border: Border.all(color: KColors.warning.withValues(alpha: .4)),
    ),
    child: const Row(
      children: [
        Icon(Icons.health_and_safety_outlined, color: KColors.warning),
        SizedBox(width: KSpacing.sm),
        Expanded(
          child: KLocalizedText(
            'নিরাপত্তা বিষয়ক কোর্স। পরীক্ষায় পাস করলে জ্ঞান যাচাই হয়, এটি কোনো লাইসেন্স নয়।',
          ),
        ),
      ],
    ),
  );
}

class _LessonTile extends StatelessWidget {
  const _LessonTile({required this.lesson, required this.onOpen});

  final TrainingLesson lesson;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final language = languageOf(context);
    final (IconData icon, Color color, String state) = switch (lesson.state) {
      LessonState.done => (Icons.check_circle, KColors.success, 'পাঠ শেষ'),
      LessonState.locked => (
        Icons.lock_outline,
        KColors.textSecondary,
        'পাঠ বন্ধ',
      ),
      LessonState.open =>
        lesson.opened
            ? (Icons.check_circle_outline, KColors.primary, 'খোলা হয়েছে')
            : (Icons.circle_outlined, KColors.textSecondary, 'খোলা'),
    };
    return Card(
      key: ValueKey('lesson-${lesson.id}'),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      clipBehavior: Clip.antiAlias,
      child: ListTile(
        // A locked lesson says why instead of opening.
        onTap: lesson.isLocked ? null : onOpen,
        enabled: !lesson.isLocked,
        leading: Icon(icon, color: color),
        title: Text(lesson.titleFor(language)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: KSpacing.sm,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                KLocalizedText(
                  state,
                  key: ValueKey('lesson-state-${lesson.id}'),
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                ),
                KLocalizedText(
                  lesson.hasVideo ? 'ভিডিও ও নোট' : 'লেখা নোট',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (lesson.checkpoint != null)
                  KLocalizedText(
                    'প্রশ্ন আছে',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                if (lesson.isSafety)
                  const Icon(
                    Icons.health_and_safety_outlined,
                    size: 16,
                    color: KColors.warning,
                  ),
              ],
            ),
            if (lesson.isLocked)
              KLocalizedText(
                'আগের পাঠের প্রশ্নগুলো আগে শেষ করুন।',
                key: ValueKey('lesson-locked-reason-${lesson.id}'),
                style: Theme.of(context).textTheme.bodySmall,
              ),
          ],
        ),
        trailing: lesson.isLocked ? null : const Icon(Icons.chevron_right),
      ),
    );
  }
}

class _TestBar extends ConsumerWidget {
  const _TestBar({required this.detail});

  final CourseDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final course = detail.summary;
    final now = ref.watch(trainingClockProvider)();
    final certified = course.hasCertificate;
    final limited = !certified && course.limitReachedAt(now);
    final locked = !certified && detail.testLocked;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          KSpacing.md,
          KSpacing.sm,
          KSpacing.md,
          KSpacing.md,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (limited) ...[
              Text(
                attemptLimitMessage(context, course.nextAttemptAt),
                style: const TextStyle(color: KColors.warning),
              ),
              const SizedBox(height: KSpacing.xs),
            ],
            if (locked) ...[
              const KLocalizedText(
                'প্রতিটি পাঠের প্রশ্ন শেষ করলে পরীক্ষা খুলবে।',
                key: ValueKey('test-locked-reason'),
                style: TextStyle(color: KColors.textSecondary),
              ),
              const SizedBox(height: KSpacing.xs),
            ],
            FilledButton.icon(
              key: const ValueKey('take-test'),
              onPressed: locked
                  ? null
                  : () => context.push(
                      certified
                          ? AppRoutes.trainingCertificates
                          : AppRoutes.trainingTest(course.id),
                    ),
              icon: Icon(
                certified
                    ? Icons.workspace_premium_outlined
                    : Icons.quiz_outlined,
              ),
              label: KLocalizedText(
                certified ? 'সার্টিফিকেট দেখুন' : 'পরীক্ষা দিন',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

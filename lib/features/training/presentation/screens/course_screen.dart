import 'dart:async';

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
import '../widgets/lesson_video_section.dart';
import '../widgets/training_ui.dart';

class CourseScreen extends ConsumerStatefulWidget {
  const CourseScreen({required this.courseId, super.key});

  final String courseId;

  @override
  ConsumerState<CourseScreen> createState() => _CourseScreenState();
}

class _CourseScreenState extends ConsumerState<CourseScreen> {
  final Set<String> _openedHere = {};
  String? _expandedLessonId;

  void _toggle(TrainingLesson lesson) {
    final expanding = _expandedLessonId != lesson.id;
    setState(() => _expandedLessonId = expanding ? lesson.id : null);
    if (expanding && !lesson.opened && _openedHere.add(lesson.id)) {
      // A private checklist tick. Failure is harmless and is not retried.
      unawaited(
        ref.read(trainingRepositoryProvider).openLesson(lesson.id).then<void>((
          _,
        ) {
          if (mounted) ref.invalidate(trainingCoursesProvider);
        }, onError: (Object _) {}),
      );
    }
  }

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
        data: (value) => _TestBar(course: value.summary),
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
        const KLocalizedText(
          'পাঠ খোলার টিক শুধু আপনার নিজের হিসাবের জন্য। অভিজ্ঞ হলে পাঠ বাদ দিয়ে সরাসরি পরীক্ষা দিন।',
          style: TextStyle(color: KColors.textSecondary),
        ),
        const SizedBox(height: KSpacing.sm),
        for (final lesson in detail.lessons)
          _LessonTile(
            lesson: lesson,
            opened: lesson.opened || _openedHere.contains(lesson.id),
            expanded: _expandedLessonId == lesson.id,
            estimatedDataMb: detail.estimatedLessonDataMb(lesson),
            onToggle: () => _toggle(lesson),
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
  const _LessonTile({
    required this.lesson,
    required this.opened,
    required this.expanded,
    required this.estimatedDataMb,
    required this.onToggle,
  });

  final int estimatedDataMb;
  final bool expanded;
  final TrainingLesson lesson;
  final VoidCallback onToggle;
  final bool opened;

  @override
  Widget build(BuildContext context) {
    final language = languageOf(context);
    final notes = lesson.notesFor(language);
    return Card(
      key: ValueKey('lesson-${lesson.id}'),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            onTap: onToggle,
            leading: Icon(
              opened ? Icons.check_circle_outline : Icons.circle_outlined,
              color: opened ? KColors.primary : KColors.textSecondary,
            ),
            title: Text(lesson.titleFor(language)),
            subtitle: Row(
              children: [
                Icon(
                  lesson.hasVideo
                      ? Icons.ondemand_video_outlined
                      : Icons.article_outlined,
                  size: 16,
                  color: KColors.textSecondary,
                ),
                const SizedBox(width: KSpacing.xs),
                Flexible(
                  child: KLocalizedText(
                    lesson.hasVideo ? 'ভিডিও ও নোট' : 'লেখা নোট',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                if (lesson.isSafety) ...[
                  const SizedBox(width: KSpacing.sm),
                  const Icon(
                    Icons.health_and_safety_outlined,
                    size: 16,
                    color: KColors.warning,
                  ),
                ],
              ],
            ),
            trailing: Icon(
              expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
            ),
          ),
          if (expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                KSpacing.md,
                0,
                KSpacing.md,
                KSpacing.md,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (lesson.youtubeVideoId case final videoId?) ...[
                    LessonVideoSection(
                      videoId: videoId,
                      estimatedDataMb: estimatedDataMb,
                    ),
                    const SizedBox(height: KSpacing.md),
                  ],
                  KLocalizedText(
                    'নোট',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: KSpacing.xs),
                  SelectableText(notes, key: const ValueKey('lesson-notes')),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _TestBar extends ConsumerWidget {
  const _TestBar({required this.course});

  final CourseSummary course;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = ref.watch(trainingClockProvider)();
    final certified = course.hasCertificate;
    final limited = !certified && course.limitReachedAt(now);
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
            FilledButton.icon(
              key: const ValueKey('take-test'),
              onPressed: () => context.push(
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

import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failure_copy.dart';
import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_empty_state.dart';
import '../../../../core/widgets/k_error_state.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../domain/training_models.dart';
import '../training_providers.dart';
import '../widgets/lesson_video_section.dart';
import '../widgets/training_ui.dart';

/// One lesson: its step cards (or the summary on an older server), the
/// video if there is one, then the lesson questions.
class LessonScreen extends ConsumerStatefulWidget {
  const LessonScreen({
    required this.courseId,
    required this.lessonId,
    super.key,
  });

  final String courseId;
  final String lessonId;

  @override
  ConsumerState<LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends ConsumerState<LessonScreen> {
  bool _openSent = false;

  /// Ticks the lesson as opened once (a lesson without questions is done
  /// once opened). Failure is harmless and not retried.
  void _markOpened(TrainingLesson lesson) {
    if (_openSent || lesson.isLocked || lesson.opened) return;
    _openSent = true;
    unawaited(
      ref.read(trainingRepositoryProvider).openLesson(lesson.id).then<void>((
        _,
      ) {
        if (mounted) invalidateTrainingState(ref, courseId: widget.courseId);
      }, onError: (Object _) {}),
    );
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(courseDetailProvider(widget.courseId));
    final lesson = detail.valueOrNull?.lesson(widget.lessonId);
    return Scaffold(
      appBar: AppBar(
        title: lesson == null
            ? const KLocalizedText('পাঠ')
            : Text(
                lesson.titleFor(languageOf(context)),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
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
        data: (course) {
          final item = course.lesson(widget.lessonId);
          if (item == null) {
            return const KEmptyState(
              icon: Icons.search_off,
              title: 'পাঠটি পাওয়া যায়নি',
              message: 'কোর্সে ফিরে আবার চেষ্টা করুন।',
            );
          }
          if (item.isLocked) {
            // Steps of a locked lesson are sent, but not shown.
            return const KEmptyState(
              key: ValueKey('lesson-locked'),
              icon: Icons.lock_outline,
              title: 'এই পাঠ এখনো বন্ধ',
              message:
                  'আগের পাঠের প্রশ্নগুলো শেষ করলে এই পাঠ খুলবে। নিরাপত্তার কোর্সে পাঠগুলো ক্রমানুসারে খোলে।',
            );
          }
          WidgetsBinding.instance.addPostFrameCallback(
            (_) => _markOpened(item),
          );
          return _LessonBody(course: course, lesson: item);
        },
      ),
    );
  }
}

class _LessonBody extends StatelessWidget {
  const _LessonBody({required this.course, required this.lesson});

  final CourseDetail course;
  final TrainingLesson lesson;

  @override
  Widget build(BuildContext context) {
    final language = languageOf(context);
    var stepNumber = 0;
    return ListView(
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        Text(
          lesson.titleFor(language),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: KSpacing.md),
        if (lesson.youtubeVideoId case final videoId?) ...[
          LessonVideoSection(
            videoId: videoId,
            estimatedDataMb: course.estimatedLessonDataMb(lesson),
          ),
          const SizedBox(height: KSpacing.md),
        ],
        if (lesson.steps.isEmpty)
          // An older server: the summary as before.
          Card(
            key: const ValueKey('lesson-summary'),
            child: Padding(
              padding: const EdgeInsets.all(KSpacing.md),
              child: SelectableText(lesson.notesFor(language)),
            ),
          )
        else
          for (final step in lesson.steps)
            StepCard(
              step: step,
              number: step.kind == LessonStepKind.step ? ++stepNumber : null,
            ),
        if (lesson.checkpoint != null) ...[
          const SizedBox(height: KSpacing.md),
          LessonCheckpointSection(course: course, lesson: lesson),
        ],
        const SizedBox(height: KSpacing.xl),
      ],
    );
  }
}

/// One step card. The kind is told by an icon and a label, never by colour
/// alone; STEP cards are numbered by the app.
class StepCard extends StatelessWidget {
  const StepCard({required this.step, this.number, super.key});

  final LessonStep step;
  final int? number;

  @override
  Widget build(BuildContext context) {
    final language = languageOf(context);
    final hazard = step.kind == LessonStepKind.hazard;
    final label = switch (step.kind) {
      LessonStepKind.learn => KaajLocalizations.text(context, 'আপনি শিখবেন'),
      LessonStepKind.step =>
        '${KaajLocalizations.text(context, 'ধাপ')} '
            '${KFormat.count(context, number ?? 1)}',
      LessonStepKind.hazard => KaajLocalizations.text(context, 'বিপদের ঝুঁকি'),
      LessonStepKind.remember => KaajLocalizations.text(context, 'মনে রাখুন'),
    };
    final icon = switch (step.kind) {
      LessonStepKind.learn => Icons.flag_outlined,
      LessonStepKind.step => Icons.check_box_outlined,
      LessonStepKind.hazard => Icons.warning_amber_rounded,
      LessonStepKind.remember => Icons.lightbulb_outline,
    };
    final accent = hazard ? KColors.danger : KColors.primary;
    return Card(
      key: ValueKey('step-${step.id}'),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(KRadius.sm),
        side: hazard
            ? const BorderSide(color: KColors.danger, width: 2)
            : BorderSide.none,
      ),
      color: hazard ? KColors.danger.withValues(alpha: .06) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (step.image case final image?) StepPicture(image: image),
          Padding(
            padding: const EdgeInsets.all(KSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Row(
                    children: [
                      Icon(icon, color: accent, size: 22),
                      const SizedBox(width: KSpacing.xs),
                      Flexible(
                        child: Text(
                          label,
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(
                                color: accent,
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: KSpacing.xs),
                Text(step.textFor(language)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A step picture in a fixed aspect box, so nothing jumps while it loads.
/// Cached by its stable key (the signed URL changes daily). A picture that
/// fails to load leaves a text-only card.
class StepPicture extends StatefulWidget {
  const StepPicture({required this.image, super.key});

  final StepImage image;

  @override
  State<StepPicture> createState() => _StepPictureState();
}

class _StepPictureState extends State<StepPicture> {
  bool _failed = false;

  @override
  Widget build(BuildContext context) {
    if (_failed) return const SizedBox.shrink();
    final image = widget.image;
    final alt = image.altFor(languageOf(context));
    final ratio = MediaQuery.devicePixelRatioOf(context);
    return Semantics(
      image: true,
      label: alt,
      child: AspectRatio(
        aspectRatio: image.aspectRatio.clamp(0.5, 3.0),
        child: LayoutBuilder(
          builder: (context, constraints) => CachedNetworkImage(
            key: ValueKey('step-picture-${image.cacheKey}'),
            imageUrl: image.url,
            cacheKey: image.cacheKey,
            fit: BoxFit.cover,
            memCacheWidth: constraints.maxWidth.isFinite
                ? (constraints.maxWidth * ratio).round()
                : null,
            placeholder: (_, _) => const ColoredBox(color: KColors.surfaceAlt),
            errorWidget: (_, _, _) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) setState(() => _failed = true);
              });
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );
  }
}

/// The lesson questions: one at a time; a wrong answer shows that
/// question's explanation and the learner tries again; passing marks the
/// lesson done and offers what comes next.
class LessonCheckpointSection extends ConsumerStatefulWidget {
  const LessonCheckpointSection({
    required this.course,
    required this.lesson,
    super.key,
  });

  final CourseDetail course;
  final TrainingLesson lesson;

  @override
  ConsumerState<LessonCheckpointSection> createState() =>
      _LessonCheckpointSectionState();
}

class _LessonCheckpointSectionState
    extends ConsumerState<LessonCheckpointSection> {
  bool _started = false;
  bool _submitting = false;
  final Map<String, String> _answers = {};

  /// Questions still to answer this try, in order.
  List<String>? _queue;
  int _position = 0;
  CheckpointResult? _result;
  String? _error;

  bool get _passed =>
      _result?.passed ?? widget.lesson.checkpoint?.passed ?? false;

  @override
  Widget build(BuildContext context) {
    if (_passed) return _doneCard(context);
    if (!_started) return _intro(context);
    final checkpoint = ref.watch(lessonCheckpointProvider(widget.lesson.id));
    return checkpoint.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(KSpacing.lg),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Card(
        child: Padding(
          padding: const EdgeInsets.all(KSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(failureText(context, error, 'প্রশ্ন লোড করা যায়নি।')),
              const SizedBox(height: KSpacing.sm),
              OutlinedButton(
                onPressed: () =>
                    ref.invalidate(lessonCheckpointProvider(widget.lesson.id)),
                child: const KLocalizedText('আবার চেষ্টা করুন'),
              ),
            ],
          ),
        ),
      ),
      data: (value) {
        if (value.passed && _result == null) return _doneCard(context);
        if (value.questions.isEmpty) {
          return const KLocalizedText('এই পাঠে কোনো প্রশ্ন নেই।');
        }
        final queue = _queue ??= [for (final q in value.questions) q.id];
        final question = value.questions.firstWhere(
          (item) => item.id == queue[_position],
          orElse: () => value.questions.first,
        );
        return _questionCard(context, value, question, queue);
      },
    );
  }

  Widget _intro(BuildContext context) {
    final count = widget.lesson.checkpoint?.questionCount ?? 2;
    return Card(
      key: const ValueKey('checkpoint-intro'),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.quiz_outlined, color: KColors.primary),
                const SizedBox(width: KSpacing.xs),
                Expanded(
                  child: KLocalizedText(
                    'পাঠের প্রশ্ন',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: KSpacing.xs),
            Text(
              [
                '${KaajLocalizations.text(context, 'প্রশ্ন:')} '
                    '${KFormat.count(context, count)}',
                KaajLocalizations.text(
                  context,
                  widget.course.lockedOrder
                      ? 'সবগুলো ঠিক হলে পাঠ শেষ হবে এবং পরের পাঠ খুলবে। যতবার খুশি চেষ্টা করা যাবে।'
                      : 'অনুশীলনের জন্য। সবগুলো ঠিক হলে পাঠ শেষ হবে। যতবার খুশি চেষ্টা করা যাবে।',
                ),
              ].join('\n'),
            ),
            const SizedBox(height: KSpacing.sm),
            FilledButton(
              key: const ValueKey('checkpoint-start'),
              onPressed: () => setState(() => _started = true),
              child: const KLocalizedText('প্রশ্ন শুরু করুন'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _questionCard(
    BuildContext context,
    LessonCheckpoint checkpoint,
    TestQuestion question,
    List<String> queue,
  ) {
    final language = languageOf(context);
    final wrong = _result?.resultFor(question.id);
    final selected = _answers[question.id];
    final last = _position >= queue.length - 1;
    final total = checkpoint.questions.length;
    final number = checkpoint.questions.indexOf(question) + 1;
    return Card(
      key: ValueKey('checkpoint-question-${question.id}'),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${KaajLocalizations.text(context, 'প্রশ্ন')} '
              '${KFormat.count(context, number)} / '
              '${KFormat.count(context, total)}',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: KSpacing.xs),
            Text(
              question.promptFor(language),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (wrong != null && !wrong.correct) ...[
              const SizedBox(height: KSpacing.sm),
              Container(
                key: const ValueKey('checkpoint-explanation'),
                padding: const EdgeInsets.all(KSpacing.sm),
                decoration: BoxDecoration(
                  color: KColors.warning.withValues(alpha: .10),
                  borderRadius: BorderRadius.circular(KRadius.sm),
                  border: Border.all(color: KColors.warning),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline, color: KColors.warning),
                    const SizedBox(width: KSpacing.xs),
                    Expanded(
                      child: Text(
                        [
                          KaajLocalizations.text(
                            context,
                            'ঠিক হয়নি। আবার বেছে নিন।',
                          ),
                          if (wrong.explanationFor(language).isNotEmpty)
                            wrong.explanationFor(language),
                        ].join('\n'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: KSpacing.sm),
            RadioGroup<String>(
              groupValue: selected,
              onChanged: (value) {
                if (_submitting || value == null) return;
                setState(() => _answers[question.id] = value);
              },
              child: Column(
                children: [
                  for (final option in question.options)
                    RadioListTile<String>(
                      key: ValueKey('checkpoint-option-${option.id}'),
                      contentPadding: EdgeInsets.zero,
                      value: option.id,
                      title: Text(option.textFor(language)),
                    ),
                ],
              ),
            ),
            if (_error case final error?) ...[
              Text(error, style: const TextStyle(color: KColors.danger)),
              const SizedBox(height: KSpacing.xs),
            ],
            FilledButton(
              key: const ValueKey('checkpoint-next'),
              onPressed: selected == null || _submitting
                  ? null
                  : () => last
                        ? _submit(checkpoint)
                        : setState(() => _position++),
              child: _submitting
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : KLocalizedText(last ? 'উত্তর জমা দিন' : 'পরের প্রশ্ন'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit(LessonCheckpoint checkpoint) async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(trainingRepositoryProvider)
          .submitCheckpoint(widget.lesson.id, {
            for (final question in checkpoint.questions)
              question.id: ?_answers[question.id],
          });
      if (!mounted) return;
      if (result.passed || result.lessonState == LessonState.done) {
        invalidateTrainingState(ref, courseId: widget.course.summary.id);
      }
      setState(() {
        _result = result;
        // Ask again only what was wrong, keeping the right answers.
        _queue = [
          for (final question in checkpoint.questions)
            if (!(result.resultFor(question.id)?.correct ?? false)) question.id,
        ];
        _position = 0;
        if (result.passed) _queue = null;
      });
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _error = failureText(context, error, 'উত্তর জমা হয়নি।'),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _doneCard(BuildContext context) {
    final result = _result;
    final courseId = widget.course.summary.id;
    final nextId =
        result?.nextLessonId ?? widget.course.lessonAfter(widget.lesson.id)?.id;
    final nextLocked = result != null
        ? result.nextLessonState == LessonState.locked
        : widget.course.lessonAfter(widget.lesson.id)?.isLocked ?? false;
    final testLocked = result?.testLocked ?? widget.course.testLocked;
    return Card(
      key: const ValueKey('checkpoint-done'),
      color: KColors.success.withValues(alpha: .08),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.check_circle, color: KColors.success),
                const SizedBox(width: KSpacing.xs),
                Expanded(
                  child: KLocalizedText(
                    'পাঠ শেষ হয়েছে',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: KSpacing.xs),
            const KLocalizedText('এই পাঠের সব প্রশ্নের উত্তর ঠিক হয়েছে।'),
            const SizedBox(height: KSpacing.sm),
            if (nextId != null && !nextLocked)
              FilledButton.icon(
                key: const ValueKey('lesson-next'),
                onPressed: () => context.pushReplacement(
                  AppRoutes.trainingLesson(courseId, nextId),
                ),
                icon: const Icon(Icons.arrow_forward),
                label: const KLocalizedText('পরের পাঠ'),
              )
            else if (nextId == null && !testLocked)
              FilledButton.icon(
                key: const ValueKey('lesson-take-test'),
                onPressed: () =>
                    context.pushReplacement(AppRoutes.trainingTest(courseId)),
                icon: const Icon(Icons.quiz_outlined),
                label: const KLocalizedText('পরীক্ষা দিন'),
              )
            else
              OutlinedButton(
                key: const ValueKey('lesson-back-to-course'),
                onPressed: () => context.pop(),
                child: const KLocalizedText('কোর্সে ফিরুন'),
              ),
          ],
        ),
      ),
    );
  }
}

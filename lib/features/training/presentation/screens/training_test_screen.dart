import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../domain/training_models.dart';
import '../training_providers.dart';
import '../widgets/training_ui.dart';

class TrainingTestScreen extends ConsumerStatefulWidget {
  const TrainingTestScreen({required this.courseId, super.key});

  final String courseId;

  @override
  ConsumerState<TrainingTestScreen> createState() => _TrainingTestScreenState();
}

class _TrainingTestScreenState extends ConsumerState<TrainingTestScreen> {
  TrainingAttempt? _attempt;
  Object? _startError;
  bool _starting = true;
  bool _submitting = false;
  String? _submitError;
  TestResult? _result;
  final Map<String, String> _answers = {};

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    setState(() {
      _starting = true;
      _startError = null;
      _submitError = null;
      _result = null;
      _attempt = null;
      _answers.clear();
    });
    try {
      final attempt = await ref
          .read(trainingRepositoryProvider)
          .startAttempt(widget.courseId);
      if (mounted) setState(() => _attempt = attempt);
    } on Object catch (error) {
      if (mounted) setState(() => _startError = error);
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  Future<void> _submit() async {
    final attempt = _attempt;
    if (attempt == null) return;
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    try {
      final result = await ref
          .read(trainingRepositoryProvider)
          .submitAttempt(attempt.attemptId, Map.of(_answers));
      invalidateTrainingState(ref, courseId: widget.courseId);
      if (mounted) setState(() => _result = result);
    } on Object catch (error) {
      if (mounted) {
        setState(() => _submitError = trainingFailureMessage(context, error));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const KLocalizedText('জ্ঞান পরীক্ষা')),
    body: _content(context),
  );

  Widget _content(BuildContext context) {
    if (_starting) return const Center(child: CircularProgressIndicator());
    if (_startError case final error?) {
      return _StartProblem(
        message: trainingFailureMessage(context, error),
        onRetry: _start,
      );
    }
    if (_result case final result?) {
      return _ResultView(
        attempt: _attempt!,
        answers: _answers,
        result: result,
        onRetry: _start,
      );
    }
    final attempt = _attempt!;
    final language = languageOf(context);
    final english = KaajLocalizations.isEnglish(context);
    final deadline = KFormat.time(context, attempt.expiresAt);
    final complete = attempt.questions.every(
      (question) => _answers.containsKey(question.id),
    );
    return ListView(
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        Text(
          english
              ? 'Answer every question and submit before $deadline.'
              : '$deadline-এর মধ্যে সব প্রশ্নের উত্তর দিয়ে জমা দিন।',
          style: const TextStyle(color: KColors.textSecondary),
        ),
        const SizedBox(height: KSpacing.sm),
        for (final (index, question) in attempt.questions.indexed)
          Card(
            key: ValueKey('question-${question.id}'),
            margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
            child: Padding(
              padding: const EdgeInsets.all(KSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${KFormat.count(context, index + 1)}. ${question.promptFor(language)}',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  RadioGroup<String>(
                    groupValue: _answers[question.id],
                    onChanged: (value) {
                      if (value == null || _submitting) return;
                      setState(() => _answers[question.id] = value);
                    },
                    child: Column(
                      children: [
                        for (final option in question.options)
                          RadioListTile<String>(
                            key: ValueKey('option-${question.id}-${option.id}'),
                            contentPadding: EdgeInsets.zero,
                            value: option.id,
                            title: Text(option.textFor(language)),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (_submitError case final message?) ...[
          const SizedBox(height: KSpacing.sm),
          Text(message, style: const TextStyle(color: KColors.danger)),
        ],
        const SizedBox(height: KSpacing.md),
        if (!complete)
          const Padding(
            padding: EdgeInsets.only(bottom: KSpacing.sm),
            child: KLocalizedText(
              'জমা দিতে সব প্রশ্নের উত্তর দিন।',
              style: TextStyle(color: KColors.textSecondary),
            ),
          ),
        FilledButton(
          key: const ValueKey('submit-test'),
          onPressed: complete && !_submitting ? _submit : null,
          child: _submitting
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const KLocalizedText('জমা দিন'),
        ),
        const SizedBox(height: KSpacing.xl),
      ],
    );
  }
}

class _StartProblem extends StatelessWidget {
  const _StartProblem({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.info_outline, size: 40, color: KColors.warning),
          const SizedBox(height: KSpacing.md),
          Text(
            message,
            key: const ValueKey('test-start-problem'),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: KSpacing.lg),
          OutlinedButton(
            onPressed: () => context.pop(),
            child: const KLocalizedText('কোর্সে ফিরুন'),
          ),
          TextButton(
            onPressed: onRetry,
            child: const KLocalizedText('আবার চেষ্টা করুন'),
          ),
        ],
      ),
    ),
  );
}

class _ResultView extends StatelessWidget {
  const _ResultView({
    required this.attempt,
    required this.answers,
    required this.result,
    required this.onRetry,
  });

  final Map<String, String> answers;
  final TrainingAttempt attempt;
  final VoidCallback onRetry;
  final TestResult result;

  @override
  Widget build(BuildContext context) {
    final language = languageOf(context);
    final english = KaajLocalizations.isEnglish(context);
    final score = KFormat.count(context, result.scorePct);
    final passMark = KFormat.count(context, result.passMarkPct);
    final byQuestion = {
      for (final item in result.results) item.questionId: item,
    };
    return ListView(
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        Icon(
          result.passed ? Icons.verified_outlined : Icons.refresh_rounded,
          size: 56,
          color: result.passed ? KColors.success : KColors.warning,
        ),
        const SizedBox(height: KSpacing.sm),
        KLocalizedText(
          result.passed ? 'আপনি পাস করেছেন' : 'এবার পাস হয়নি',
          key: const ValueKey('test-outcome'),
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        Text(
          english
              ? 'Your score: $score% · pass mark $passMark%'
              : 'আপনার নম্বর: $score% · পাস নম্বর $passMark%',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: KSpacing.md),
        if (result.passed && result.certificate != null) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(KSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const KLocalizedText(knowledgeTestedWording),
                  Text(
                    english
                        ? 'Certificate code: ${result.certificate!.code}'
                        : 'সার্টিফিকেট কোড: ${result.certificate!.code}',
                  ),
                  if (result.certificate!.isSafetyCritical)
                    const KLocalizedText(
                      notALicenceWording,
                      style: TextStyle(color: KColors.warning),
                    ),
                ],
              ),
            ),
          ),
          FilledButton.icon(
            key: const ValueKey('open-certificates'),
            onPressed: () =>
                context.pushReplacement(AppRoutes.trainingCertificates),
            icon: const Icon(Icons.workspace_premium_outlined),
            label: const KLocalizedText('সার্টিফিকেট দেখুন'),
          ),
        ] else if (!result.passed) ...[
          const KLocalizedText(
            'নিচের ব্যাখ্যা পড়ে আবার চেষ্টা করতে পারেন। দিনে তিনবার পর্যন্ত চেষ্টা করা যায়।',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: KSpacing.sm),
          FilledButton(
            onPressed: onRetry,
            child: const KLocalizedText('আবার পরীক্ষা দিন'),
          ),
        ],
        const SizedBox(height: KSpacing.lg),
        KLocalizedText(
          'উত্তরের ব্যাখ্যা',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        for (final question in attempt.questions)
          if (byQuestion[question.id] case final item?)
            _Explanation(
              question: question,
              chosenOptionId: answers[question.id],
              result: item,
              language: language,
            ),
        const SizedBox(height: KSpacing.xl),
      ],
    );
  }
}

class _Explanation extends StatelessWidget {
  const _Explanation({
    required this.question,
    required this.chosenOptionId,
    required this.result,
    required this.language,
  });

  final String? chosenOptionId;
  final String language;
  final TestQuestion question;
  final QuestionResult result;

  @override
  Widget build(BuildContext context) {
    final correctOption = question.options
        .where((option) => option.id == result.correctOptionId)
        .firstOrNull;
    final english = KaajLocalizations.isEnglish(context);
    final chosen = question.options
        .where((option) => option.id == chosenOptionId)
        .firstOrNull;
    return Card(
      key: ValueKey('explanation-${question.id}'),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  result.correct ? Icons.check_circle : Icons.cancel_outlined,
                  color: result.correct ? KColors.success : KColors.danger,
                  size: 20,
                ),
                const SizedBox(width: KSpacing.sm),
                Expanded(child: Text(question.promptFor(language))),
              ],
            ),
            if (!result.correct && chosen != null) ...[
              const SizedBox(height: KSpacing.xs),
              Text(
                english
                    ? 'Your answer: ${chosen.textFor(language)}'
                    : 'আপনার উত্তর: ${chosen.textFor(language)}',
                style: const TextStyle(color: KColors.danger),
              ),
            ],
            if (!result.correct && correctOption != null) ...[
              const SizedBox(height: KSpacing.xs),
              Text(
                english
                    ? 'Correct answer: ${correctOption.textFor(language)}'
                    : 'সঠিক উত্তর: ${correctOption.textFor(language)}',
                style: const TextStyle(color: KColors.success),
              ),
            ],
            const SizedBox(height: KSpacing.xs),
            Text(
              result.explanationFor(language),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

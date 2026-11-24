import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/formatting/latin_digits_formatter.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/routing/route_arguments.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_error_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../../core/widgets/k_text_field.dart';
import '../../../core/widgets/load_more.dart';
import '../../chat/presentation/controllers/chat_providers.dart';
import '../../jobs/domain/job_models.dart';
import '../../jobs/presentation/widgets/review_dialog.dart';
import '../domain/learning_models.dart';
import 'learning_providers.dart';
import 'learning_widgets.dart';

/// The learner and mentor side of one enrolment: the terms agreed at
/// acceptance, sessions and progress, and the practical certificate.
class EnrolmentScreen extends ConsumerWidget {
  const EnrolmentScreen({required this.enrolmentId, super.key});

  final String enrolmentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enrolment = ref.watch(learningEnrolmentProvider(enrolmentId));
    Future<void> refresh() async {
      ref.invalidate(learningEnrolmentProvider(enrolmentId));
      await ref
          .read(learningEnrolmentProvider(enrolmentId).future)
          .then<void>((_) {}, onError: (_) {});
    }

    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('শেখার অগ্রগতি')),
      body: enrolment.when(
        skipLoadingOnRefresh: true,
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: KErrorState(
            failure: ErrorMapper.from(error),
            retryLabel: 'আবার চেষ্টা করুন',
            onRetry: () =>
                ref.invalidate(learningEnrolmentProvider(enrolmentId)),
          ),
        ),
        data: (item) => RefreshIndicator(
          onRefresh: refresh,
          child: _EnrolmentBody(enrolment: item),
        ),
      ),
    );
  }
}

class _EnrolmentBody extends ConsumerWidget {
  const _EnrolmentBody({required this.enrolment});

  final LearningEnrolment enrolment;

  void _replace(WidgetRef ref, LearningEnrolment updated) {
    ref
      ..invalidate(learningEnrolmentProvider(updated.id))
      ..invalidate(learningEnrolmentsProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final language = Localizations.localeOf(context).languageCode;
    final theme = Theme.of(context);
    final item = enrolment;
    final contract = item.contract;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        Chip(
          avatar: const Icon(Icons.school_outlined, size: 16),
          label: KLocalizedText(learningKindLabel(item.kind)),
        ),
        Text(item.title, style: theme.textTheme.headlineSmall),
        KLocalizedText(
          item.isMentor ? 'আপনি মেন্টর' : 'আপনি শিক্ষার্থী',
          style: theme.textTheme.bodySmall,
        ),
        if (item.isMentor && item.learnerName.isNotEmpty)
          Text(
            '${KaajLocalizations.text(context, 'শিক্ষার্থী')}: ${item.learnerName}',
          ),
        if (contract != null) ...[
          const SizedBox(height: KSpacing.md),
          Card(
            key: const ValueKey('enrolment-terms'),
            child: Padding(
              padding: const EdgeInsets.all(KSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  KLocalizedText(
                    'গ্রহণের সময় সম্মত শর্ত',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: KSpacing.xs),
                  TermsBadge(
                    opportunity: LearningOpportunity(
                      id: item.opportunityId,
                      kind: item.kind,
                      title: item.title,
                      description: '',
                      terms: contract.terms,
                      feePoisha: contract.feePoisha,
                      stipendPoisha: contract.stipendPoisha,
                    ),
                  ),
                  const SizedBox(height: KSpacing.xs),
                  KLocalizedText(termsExplanation(contract.terms)),
                  if (contract.startsAt != null || contract.endsAt != null)
                    Text(
                      [
                        if (contract.startsAt != null)
                          KFormat.dayAndTime(context, contract.startsAt!),
                        if (contract.endsAt != null)
                          KFormat.dayAndTime(context, contract.endsAt!),
                      ].join(' – '),
                    ),
                  if (contract.deliveryFor(language).isNotEmpty)
                    Text(contract.deliveryFor(language)),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: KSpacing.md),
        KLocalizedText('অগ্রগতি', style: theme.textTheme.titleMedium),
        Text(
          key: const ValueKey('enrolment-progress'),
          [
            '${KaajLocalizations.text(context, 'সেশন')}: '
                '${KFormat.count(context, item.sessionsRecorded)}',
            '${KaajLocalizations.text(context, 'নিশ্চিত')}: '
                '${KFormat.count(context, item.sessionsConfirmed)}',
            '${KaajLocalizations.text(context, 'মোট মিনিট')}: '
                '${KFormat.count(context, item.minutesTotal)}',
          ].join(' · '),
        ),
        const SizedBox(height: KSpacing.sm),
        if (item.sessions.isEmpty)
          KLocalizedText(
            item.isMentor
                ? 'এখনো কোনো সেশন রেকর্ড করেননি।'
                : 'মেন্টর সেশন রেকর্ড করলে এখানে দেখা যাবে।',
            style: const TextStyle(color: KColors.textSecondary),
          )
        else
          for (final session in item.sessions)
            Card(
              key: ValueKey('session-${session.id}'),
              child: ListTile(
                leading: Icon(
                  session.confirmed ? Icons.check_circle : Icons.schedule,
                  color: session.confirmed
                      ? KColors.success
                      : KColors.textSecondary,
                ),
                title: Text(session.topic),
                subtitle: Text(
                  [
                    KFormat.dayAndTime(context, session.heldAt),
                    '${KFormat.count(context, session.minutes)} '
                        '${KaajLocalizations.text(context, 'মিনিট')}',
                    if (session.notes?.isNotEmpty ?? false) session.notes!,
                  ].join(' · '),
                ),
                trailing: !item.isMentor && !session.confirmed && item.isActive
                    ? TextButton(
                        key: ValueKey('confirm-${session.id}'),
                        onPressed: () => _confirm(context, ref, session),
                        child: const KLocalizedText('নিশ্চিত করুন'),
                      )
                    : session.confirmed
                    ? const KLocalizedText('নিশ্চিত')
                    : null,
              ),
            ),
        if (item.isMentor && item.isActive && !item.isCompleted) ...[
          const SizedBox(height: KSpacing.sm),
          OutlinedButton.icon(
            key: const ValueKey('record-session'),
            onPressed: () => _recordSession(context, ref),
            icon: const Icon(Icons.add),
            label: const KLocalizedText('সেশন যোগ করুন'),
          ),
          const SizedBox(height: KSpacing.sm),
          KPrimaryButton(
            key: const ValueKey('complete-learning'),
            label: 'শেখা সম্পন্ন করুন ও সার্টিফিকেট দিন',
            onPressed: () => _complete(context, ref),
          ),
        ],
        if (item.completion case final record?) ...[
          const SizedBox(height: KSpacing.md),
          _CompletionCard(enrolment: item, record: record),
        ],
        if (item.isCompleted) ...[
          const SizedBox(height: KSpacing.md),
          _LearningReviewPanel(enrolmentId: item.id),
        ],
        if (item.isActive && item.otherUserId != null) ...[
          const SizedBox(height: KSpacing.md),
          OutlinedButton.icon(
            key: const ValueKey('learning-message'),
            onPressed: () => _message(context, ref),
            icon: const Icon(Icons.chat_outlined),
            label: KLocalizedText(
              item.isMentor ? 'শিক্ষার্থীকে বার্তা দিন' : 'মেন্টরকে বার্তা দিন',
            ),
          ),
        ],
        if (item.withdrawnAt != null || item.status == 'CANCELLED') ...[
          const SizedBox(height: KSpacing.md),
          KLocalizedText(
            item.isMentor
                ? 'শিক্ষার্থী এই শেখা ছেড়ে দিয়েছেন।'
                : 'আপনি এই শেখা ছেড়ে দিয়েছেন।',
            style: const TextStyle(color: KColors.textSecondary),
          ),
        ],
        if (!item.isMentor && item.isActive && !item.isCompleted) ...[
          const SizedBox(height: KSpacing.lg),
          TextButton.icon(
            key: const ValueKey('leave-learning'),
            style: TextButton.styleFrom(foregroundColor: KColors.danger),
            onPressed: () => _leave(context, ref),
            icon: const Icon(Icons.logout),
            label: const KLocalizedText('শেখা ছেড়ে দিন'),
          ),
        ],
      ],
    );
  }

  /// Learning chats need no subscription (the server exempts them).
  Future<void> _message(BuildContext context, WidgetRef ref) async {
    final item = enrolment;
    try {
      final id = await ref
          .read(chatRepositoryProvider)
          .openConversation(
            jobId: item.opportunityId,
            participantUserId: item.otherUserId!,
          );
      ref.invalidate(conversationsProvider);
      if (context.mounted) {
        await context.push(
          AppRoutes.chatThread(id),
          extra: ChatThreadArgs(
            jobTitle: item.title,
            otherName: item.isMentor
                ? item.learnerName
                : KaajLocalizations.text(context, 'মেন্টর'),
            otherUserId: item.otherUserId,
          ),
        );
      }
    } on Object catch (error) {
      if (context.mounted) {
        showFailureSnack(context, error, 'আলোচনা এখন খোলা যাচ্ছে না।');
      }
    }
  }

  Future<void> _confirm(
    BuildContext context,
    WidgetRef ref,
    LearningSession session,
  ) async {
    try {
      final updated = await ref
          .read(learningRepositoryProvider)
          .confirmSession(session.id);
      _replace(ref, updated);
    } on Object catch (error) {
      if (context.mounted) {
        showFailureSnack(context, error, 'সেশন নিশ্চিত করা যায়নি।');
      }
    }
  }

  Future<void> _recordSession(BuildContext context, WidgetRef ref) async {
    final updated = await showDialog<LearningEnrolment>(
      context: context,
      builder: (_) => _SessionDialog(
        enrolmentId: enrolment.id,
        earliest: enrolment.earliestSessionDate(DateTime.now()),
      ),
    );
    if (updated != null) _replace(ref, updated);
  }

  Future<void> _leave(BuildContext context, WidgetRef ref) async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const KLocalizedText('শেখা ছেড়ে দেবেন?'),
        content: const KLocalizedText(
          'কোনো জরিমানা নেই, আর আসনটি অন্য কেউ পাবেন। কিন্তু এই সুযোগে আবার আবেদন করা যাবে না।',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const KLocalizedText('ফিরুন'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: KColors.danger),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const KLocalizedText('ছেড়ে দিন'),
          ),
        ],
      ),
    );
    if (sure != true) return;
    try {
      final updated = await ref
          .read(learningRepositoryProvider)
          .withdrawEnrolment(enrolment.id);
      _replace(ref, updated);
    } on Object catch (error) {
      if (context.mounted) {
        showFailureSnack(context, error, 'শেখা ছেড়ে দেওয়া যায়নি।');
      }
    }
  }

  Future<void> _complete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const KLocalizedText('শেখা সম্পন্ন করবেন?'),
        content: const KLocalizedText(
          'শিক্ষার্থী একটি অনুশীলনের সার্টিফিকেট পাবেন, যা আপনার নামে যাচাই করা যাবে। শিক্ষার্থী অন্তত একটি সেশন নিশ্চিত করার পরই এটি দেওয়া যায়।',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const KLocalizedText('ফিরুন'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const KLocalizedText('সম্পন্ন করুন'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final updated = await ref
          .read(learningRepositoryProvider)
          .complete(enrolment.id);
      _replace(ref, updated);
    } on Object catch (error) {
      if (context.mounted) {
        showFailureSnack(context, error, 'শেখা সম্পন্ন করা যায়নি।');
      }
    }
  }
}

/// Text a learner can share so others can check the certificate.
String practicalShareText(
  BuildContext context, {
  required String title,
  required String code,
}) => KaajLocalizations.isEnglish(context)
    ? 'I completed practical learning in $title with a KAAJ mentor. Certificate code: $code'
    : 'আমি KAAJ মেন্টরের সাথে $title হাতে-কলমে শিখেছি। সার্টিফিকেট কোড: $code';

class _CompletionCard extends StatelessWidget {
  const _CompletionCard({required this.enrolment, required this.record});

  final LearningEnrolment enrolment;
  final CompletionRecord record;

  @override
  Widget build(BuildContext context) => Card(
    key: const ValueKey('completion-record'),
    color: KColors.success.withValues(alpha: .08),
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                record.valid ? Icons.workspace_premium : Icons.block_outlined,
                color: record.valid ? KColors.success : KColors.textSecondary,
              ),
              const SizedBox(width: KSpacing.sm),
              const Expanded(
                child: KLocalizedText('অনুশীলনের সার্টিফিকেট (মেন্টরের যাচাই)'),
              ),
            ],
          ),
          Text(KFormat.date(context, record.issuedAt)),
          SelectableText(
            '${KaajLocalizations.text(context, 'কোড')}: ${record.code}',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          if (!record.valid)
            const KLocalizedText(
              'এই সার্টিফিকেট বাতিল করা হয়েছে।',
              style: TextStyle(color: KColors.danger),
            )
          else if (!enrolment.isMentor)
            TextButton.icon(
              key: const ValueKey('share-practical'),
              onPressed: () async {
                await Clipboard.setData(
                  ClipboardData(
                    text: practicalShareText(
                      context,
                      title: enrolment.title,
                      code: record.code,
                    ),
                  ),
                );
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: KLocalizedText('শেয়ার করার লেখা কপি হয়েছে।'),
                    ),
                  );
                }
              },
              icon: const Icon(Icons.share_outlined),
              label: const KLocalizedText('শেয়ার করুন'),
            ),
        ],
      ),
    ),
  );
}

class _SessionDialog extends ConsumerStatefulWidget {
  const _SessionDialog({required this.enrolmentId, this.earliest});

  final String enrolmentId;

  /// No session earlier than this (a week before enrolment).
  final DateTime? earliest;

  @override
  ConsumerState<_SessionDialog> createState() => _SessionDialogState();
}

class _SessionDialogState extends ConsumerState<_SessionDialog> {
  final _form = GlobalKey<FormState>();
  final _topic = TextEditingController();
  final _minutes = TextEditingController(text: '60');
  final _notes = TextEditingController();
  DateTime _heldAt = DateTime.now();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _topic.dispose();
    _minutes.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _heldAt,
      firstDate:
          widget.earliest ?? DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
    );
    if (date != null) {
      setState(() => _heldAt = DateTime(date.year, date.month, date.day, 10));
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final updated = await ref
          .read(learningRepositoryProvider)
          .recordSession(
            widget.enrolmentId,
            heldAt: _heldAt,
            minutes: int.parse(latinDigits(_minutes.text.trim())),
            topic: _topic.text,
            notes: _notes.text,
          );
      if (mounted) Navigator.pop(context, updated);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = failureText(context, error, 'সেশন রেকর্ড করা যায়নি।');
      });
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const KLocalizedText('সেশন যোগ করুন'),
    content: Form(
      key: _form,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            KTextField(
              label: 'কী শেখানো হলো',
              controller: _topic,
              validator: (value) => (value?.trim().length ?? 0) < 3
                  ? 'কমপক্ষে ৩ অক্ষর লিখুন।'
                  : null,
            ),
            const SizedBox(height: KSpacing.sm),
            KTextField(
              label: 'কত মিনিট',
              controller: _minutes,
              keyboardType: TextInputType.number,
              validator: (value) {
                final minutes = int.tryParse(latinDigits(value?.trim() ?? ''));
                return minutes == null || minutes < 1 || minutes > 1440
                    ? 'সঠিক মিনিট লিখুন।'
                    : null;
              },
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_outlined),
              title: Text(KFormat.date(context, _heldAt)),
              onTap: _pickDate,
            ),
            KTextField(label: 'নোট (ঐচ্ছিক)', controller: _notes, maxLines: 2),
            if (_error case final error?)
              Semantics(
                liveRegion: true,
                child: Text(
                  error,
                  style: const TextStyle(color: KColors.danger),
                ),
              ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _saving ? null : () => Navigator.pop(context),
        child: const KLocalizedText('ফিরুন'),
      ),
      FilledButton(
        key: const ValueKey('save-session'),
        onPressed: _saving ? null : _save,
        child: const KLocalizedText('সংরক্ষণ করুন'),
      ),
    ],
  );
}

/// The persons enrolments, as learner or mentor, for My activity.
/// My activity, Learn: my applications to learn with a mentor, with load
/// more. Hidden when there are none or the server has no such list yet.
class MyLearningApplicationsSection extends ConsumerStatefulWidget {
  const MyLearningApplicationsSection({super.key});

  @override
  ConsumerState<MyLearningApplicationsSection> createState() =>
      _MyLearningApplicationsSectionState();
}

class _MyLearningApplicationsSectionState
    extends ConsumerState<MyLearningApplicationsSection> {
  final _more = MorePages<MyLearningApplication>();

  @override
  Widget build(BuildContext context) {
    final applications = ref.watch(myLearningApplicationsProvider);
    return applications.when(
      loading: () => const LinearProgressIndicator(),
      error: (error, _) => ErrorMapper.from(error).kind == FailureKind.notFound
          ? const SizedBox.shrink()
          : Text(failureText(context, error, 'আবেদনের তালিকা লোড করা যায়নি।')),
      data: (firstPage) {
        final items = _more.merge(firstPage);
        if (items.isEmpty) return const SizedBox.shrink();
        return Column(
          key: const ValueKey('my-learning-applications'),
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            KLocalizedText(
              'আমার শেখার আবেদন',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            for (final item in items)
              Card(
                key: ValueKey('learning-application-${item.id}'),
                child: ListTile(
                  leading: const Icon(
                    Icons.assignment_outlined,
                    color: KColors.primary,
                  ),
                  title: Text(item.title),
                  subtitle: Text(
                    [
                      KaajLocalizations.text(
                        context,
                        learningApplicationStatusLabel(item.status),
                      ),
                      KaajLocalizations.text(
                        context,
                        learningKindLabel(item.kind),
                      ),
                      if (item.mentorName case final name? when name.isNotEmpty)
                        name,
                      if (item.appliedAt case final at?)
                        KFormat.date(context, at),
                    ].join(' · '),
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push(
                    item.enrolmentId == null
                        ? AppRoutes.learningOpportunity(item.opportunityId)
                        : AppRoutes.learningEnrolment(item.enrolmentId!),
                  ),
                ),
              ),
            if (_more.hasMore)
              LoadMoreButton(
                key: const ValueKey('learning-applications-load-more'),
                loading: _more.loading,
                failed: _more.failed,
                onPressed: () => _more.loadNext(
                  (cursor) => ref
                      .read(learningRepositoryProvider)
                      .myApplications(cursor: cursor),
                  () {
                    if (mounted) setState(() {});
                  },
                ),
              ),
            const SizedBox(height: KSpacing.md),
          ],
        );
      },
    );
  }
}

class MyEnrolmentsSection extends ConsumerWidget {
  const MyEnrolmentsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enrolments = ref.watch(learningEnrolmentsProvider);
    return enrolments.when(
      loading: () => const LinearProgressIndicator(),
      // A server without enrolments yet answers 404: show nothing.
      error: (error, _) => ErrorMapper.from(error).kind == FailureKind.notFound
          ? const SizedBox.shrink()
          : Text(failureText(context, error, 'শেখার তালিকা লোড করা যায়নি।')),
      data: (items) => items.isEmpty
          ? const SizedBox.shrink()
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                KLocalizedText(
                  'মেন্টরের সাথে শেখা',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                for (final item in items)
                  Card(
                    key: ValueKey('enrolment-${item.id}'),
                    child: ListTile(
                      leading: Icon(
                        item.isCompleted
                            ? Icons.workspace_premium
                            : Icons.school_outlined,
                        color: KColors.primary,
                      ),
                      title: Text(item.title),
                      subtitle: Text(
                        [
                          KaajLocalizations.text(
                            context,
                            item.isMentor ? 'আপনি মেন্টর' : 'আপনি শিক্ষার্থী',
                          ),
                          if (item.isMentor && item.learnerName.isNotEmpty)
                            item.learnerName,
                          '${KaajLocalizations.text(context, 'সেশন')}: '
                              '${KFormat.count(context, item.sessionsRecorded)}',
                          if (item.isCompleted)
                            KaajLocalizations.text(context, 'সম্পন্ন'),
                        ].join(' · '),
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () =>
                          context.push(AppRoutes.learningEnrolment(item.id)),
                    ),
                  ),
                const SizedBox(height: KSpacing.md),
              ],
            ),
    );
  }
}

/// On the mentors own opportunity: who applied, with accept and decline.
class MentorApplicationsPanel extends ConsumerWidget {
  const MentorApplicationsPanel({required this.opportunityId, super.key});

  final String opportunityId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final applications = ref.watch(learningApplicationsProvider(opportunityId));
    Future<void> decide(LearningApplication item, bool accept) async {
      try {
        final repository = ref.read(learningRepositoryProvider);
        if (accept) {
          await repository.acceptApplication(item.id);
        } else {
          await repository.declineApplication(item.id);
        }
        ref
          ..invalidate(learningApplicationsProvider(opportunityId))
          ..invalidate(learningDetailProvider(opportunityId))
          ..invalidate(learningEnrolmentsProvider);
        if (context.mounted && accept) {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(
              const SnackBar(
                content: KLocalizedText(
                  'শিক্ষার্থী নেওয়া হয়েছে। আমার কার্যক্রমে অগ্রগতি রাখুন।',
                ),
              ),
            );
        }
      } on Object catch (error) {
        if (context.mounted) {
          showFailureSnack(
            context,
            error,
            'সিদ্ধান্ত সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
          );
        }
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KLocalizedText(
          'আবেদনকারী শিক্ষার্থী',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        applications.when(
          loading: () => const LinearProgressIndicator(),
          error: (error, _) => Text(
            failureText(context, error, 'আবেদনের তালিকা লোড করা যায়নি।'),
          ),
          data: (items) => items.isEmpty
              ? const KLocalizedText(
                  'এখনো কেউ আবেদন করেননি।',
                  style: TextStyle(color: KColors.textSecondary),
                )
              : Column(
                  children: [
                    for (final item in items)
                      Card(
                        key: ValueKey('learning-application-${item.id}'),
                        child: Padding(
                          padding: const EdgeInsets.all(KSpacing.sm),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.learnerName,
                                style: Theme.of(context).textTheme.titleSmall,
                              ),
                              if (item.message?.isNotEmpty ?? false)
                                Text(item.message!),
                              if (item.isPending)
                                Wrap(
                                  spacing: KSpacing.sm,
                                  children: [
                                    FilledButton(
                                      key: ValueKey('accept-${item.id}'),
                                      style: FilledButton.styleFrom(
                                        minimumSize: const Size(0, 40),
                                      ),
                                      onPressed: () => decide(item, true),
                                      child: const KLocalizedText('গ্রহণ'),
                                    ),
                                    OutlinedButton(
                                      key: ValueKey('decline-${item.id}'),
                                      style: OutlinedButton.styleFrom(
                                        minimumSize: const Size(0, 40),
                                      ),
                                      onPressed: () => decide(item, false),
                                      child: const KLocalizedText('না'),
                                    ),
                                  ],
                                )
                              else
                                KLocalizedText(
                                  item.status == 'ACCEPTED'
                                      ? 'গৃহীত'
                                      : 'প্রত্যাখ্যাত',
                                ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

/// Learner and mentor review each other after completion, double blind:
/// each sees the other review once both reviewed or the window closed.
class _LearningReviewPanel extends ConsumerWidget {
  const _LearningReviewPanel({required this.enrolmentId});

  final String enrolmentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(learningReviewStateProvider(enrolmentId));
    return state.when(
      loading: () => const LinearProgressIndicator(),
      // Older servers without learning reviews: show nothing.
      error: (error, _) => const SizedBox.shrink(),
      data: (review) => Card(
        key: const ValueKey('learning-review'),
        child: Padding(
          padding: const EdgeInsets.all(KSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              KLocalizedText(
                'রিভিউ',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (review.myReview case final mine?)
                Text(
                  '${KaajLocalizations.text(context, 'আপনার রেটিং')}: '
                  '${'★' * mine.rating}${'☆' * (5 - mine.rating)}',
                ),
              if (!review.revealed && review.myReview != null)
                const KLocalizedText(
                  'অন্য পক্ষ রিভিউ দিলে, অথবা ৭ দিন শেষে, রিভিউ দেখা যাবে।',
                ),
              if (review.receivedReview case final received?) ...[
                Text(
                  '${received.reviewerName}: '
                  '${'★' * received.rating}${'☆' * (5 - received.rating)}',
                ),
                if (received.comment?.isNotEmpty ?? false)
                  Text(received.comment!),
              ],
              if (review.canReview)
                FilledButton(
                  key: const ValueKey('review-learning'),
                  onPressed: () async {
                    final input = await showDialog<ReviewInput>(
                      context: context,
                      builder: (_) => const ReviewDialog(),
                    );
                    if (input == null) return;
                    try {
                      await ref
                          .read(learningRepositoryProvider)
                          .submitReview(enrolmentId, input);
                      ref.invalidate(learningReviewStateProvider(enrolmentId));
                    } on Object catch (error) {
                      if (context.mounted) {
                        showFailureSnack(
                          context,
                          error,
                          'রিভিউ জমা দেওয়া যায়নি।',
                        );
                      }
                    }
                  },
                  child: const KLocalizedText('রিভিউ দিন'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

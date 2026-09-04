import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_primary_button.dart';
import '../../../../core/widgets/k_text_field.dart';
import '../../../catalog/domain/entities/catalog_category.dart';
import '../../../catalog/domain/entities/catalog_skill.dart';
import '../../../catalog/presentation/controllers/catalog_providers.dart';
import '../../../chat/presentation/controllers/chat_providers.dart';
import '../../../onboarding/domain/onboarding_state.dart';
import '../../../onboarding/presentation/controllers/onboarding_controller.dart';
import '../../../profile/domain/public_worker_profile.dart';
import '../../../profile/presentation/controllers/public_profile_provider.dart';
import '../../../trust_safety/domain/trust_models.dart';
import '../../../trust_safety/presentation/trust_safety_providers.dart';
import '../../domain/job_models.dart';
import '../controllers/jobs_providers.dart';

class JobFeedScreen extends ConsumerStatefulWidget {
  const JobFeedScreen({
    this.categoryId,
    this.categoryName,
    this.skillId,
    this.skillName,
    super.key,
  });

  final String? categoryId;
  final String? categoryName;
  final String? skillId;
  final String? skillName;

  @override
  ConsumerState<JobFeedScreen> createState() => _JobFeedScreenState();
}

class _JobFeedScreenState extends ConsumerState<JobFeedScreen> {
  bool _availableOnly = false;

  @override
  Widget build(BuildContext context) {
    final isWorker =
        ref.watch(onboardingControllerProvider).role == KaajRole.worker;
    final browsingType = widget.categoryId != null || widget.skillId != null;
    final showOpenJobs = isWorker || browsingType;
    final filter = JobFeedFilter(
      categoryId: widget.categoryId,
      skillId: widget.skillId,
      availableOnly: isWorker && _availableOnly,
      forMe: isWorker,
    );
    final feed = jobFeedProvider(filter);
    final jobs = showOpenJobs ? ref.watch(feed) : ref.watch(myJobsProvider);
    Future<void> refresh() async {
      if (showOpenJobs) {
        ref.invalidate(feed);
        await ref.read(feed.future);
      } else {
        ref.invalidate(myJobsProvider);
        await ref.read(myJobsProvider.future);
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.skillName ??
              widget.categoryName ??
              (isWorker ? 'কাজ খুঁজুন' : 'আমার পোস্ট করা কাজ'),
        ),
        actions: [
          IconButton(
            tooltip: 'কাজের তালিকা হালনাগাদ করুন',
            onPressed: refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      floatingActionButton: isWorker || browsingType
          ? null
          : FloatingActionButton.extended(
              onPressed: () => context.push(AppRoutes.createJob),
              icon: const Icon(Icons.post_add_rounded),
              label: const Text('কাজ পোস্ট করুন'),
            ),
      body: Column(
        children: [
          if (browsingType || isWorker)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                KSpacing.md,
                KSpacing.sm,
                KSpacing.md,
                0,
              ),
              child: Row(
                children: [
                  if (browsingType)
                    Expanded(
                      child: Text(
                        widget.skillName == null
                            ? '${widget.categoryName} বিভাগের সব পোস্ট'
                            : '${widget.categoryName} › ${widget.skillName}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    )
                  else
                    const Spacer(),
                  if (isWorker) ...[
                    const SizedBox(width: KSpacing.sm),
                    FilterChip(
                      avatar: Icon(
                        _availableOnly
                            ? Icons.event_available
                            : Icons.schedule_outlined,
                        size: 18,
                      ),
                      label: Text(
                        _availableOnly ? 'আমার সময়ে মেলে' : 'সব সময়',
                      ),
                      selected: _availableOnly,
                      onSelected: (value) =>
                          setState(() => _availableOnly = value),
                    ),
                  ],
                ],
              ),
            ),
          Expanded(
            child: jobs.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, _) => _Retry(
                label: 'কাজের তালিকা লোড করা যায়নি।',
                onRetry: () => showOpenJobs
                    ? ref.invalidate(feed)
                    : ref.invalidate(myJobsProvider),
              ),
              data: (items) => RefreshIndicator(
                onRefresh: refresh,
                child: items.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: [
                          const SizedBox(height: 240),
                          Center(
                            child: Text(
                              _availableOnly
                                  ? 'এই ধরনে আপনার সময়ের সঙ্গে মেলা কাজ নেই।'
                                  : 'এই ধরনে এখনো কোনো কাজ প্রকাশিত হয়নি।',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      )
                    : GridView.builder(
                        padding: const EdgeInsets.all(KSpacing.md),
                        physics: const AlwaysScrollableScrollPhysics(),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: _responsiveGridColumns(context),
                          crossAxisSpacing: KSpacing.md,
                          mainAxisSpacing: KSpacing.md,
                          mainAxisExtent: _jobGridCardHeight(context),
                        ),
                        itemCount: items.length,
                        itemBuilder: (context, index) => _JobCard(
                          job: items[index],
                          actionLabel: isWorker
                              ? 'আবেদন'
                              : browsingType
                              ? null
                              : 'আবেদন দেখুন',
                          onAction: isWorker
                              ? () => _showApply(context, ref, items[index])
                              : browsingType
                              ? null
                              : () => _showApplications(
                                  context,
                                  ref,
                                  items[index],
                                ),
                        ),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showApplications(
    BuildContext context,
    WidgetRef ref,
    JobSummary job,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => Consumer(
        builder: (context, sheetRef, _) {
          final applications = sheetRef.watch(jobApplicationsProvider(job.id));
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                KSpacing.lg,
                0,
                KSpacing.lg,
                KSpacing.lg,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    job.title,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: KSpacing.sm),
                  Text(
                    'ম্যাচ করা কর্মী',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: KSpacing.xs),
                  sheetRef
                      .watch(suggestedWorkersProvider(job.id))
                      .when(
                        loading: () => const LinearProgressIndicator(),
                        error: (_, _) => const Text('পরামর্শ লোড করা যায়নি।'),
                        data: (workers) => workers.isEmpty
                            ? const Text(
                                'এখনো কোনো উপযুক্ত কর্মী পাওয়া যায়নি।',
                              )
                            : SizedBox(
                                height: 92,
                                child: ListView.separated(
                                  scrollDirection: Axis.horizontal,
                                  itemCount: workers.take(8).length,
                                  separatorBuilder: (_, _) =>
                                      const SizedBox(width: KSpacing.sm),
                                  itemBuilder: (context, index) {
                                    final worker = workers[index];
                                    return ActionChip(
                                      avatar: CircleAvatar(
                                        child: Text('${worker.matchScore}%'),
                                      ),
                                      label: Text(
                                        '${worker.displayName}\n${worker.skills.take(2).join(', ')}',
                                      ),
                                      onPressed: () => context.push(
                                        AppRoutes.workerBooking(worker.id),
                                      ),
                                    );
                                  },
                                ),
                              ),
                      ),
                  const SizedBox(height: KSpacing.md),
                  applications.when(
                    loading: () => const Padding(
                      padding: EdgeInsets.all(KSpacing.xl),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                    error: (_, _) => const Padding(
                      padding: EdgeInsets.all(KSpacing.lg),
                      child: Text('আবেদনের তালিকা লোড করা যায়নি।'),
                    ),
                    data: (items) => items.isEmpty
                        ? const Padding(
                            padding: EdgeInsets.all(KSpacing.lg),
                            child: Text('এখনো কেউ আবেদন করেননি।'),
                          )
                        : Flexible(
                            child: ListView.separated(
                              shrinkWrap: true,
                              itemCount: items.length,
                              separatorBuilder: (_, _) => const Divider(),
                              itemBuilder: (context, index) {
                                final item = items[index];
                                return ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  leading: const CircleAvatar(
                                    child: Icon(Icons.person_outline),
                                  ),
                                  title: Text(
                                    'কর্মী ${item.workerUserId.substring(0, 8)}',
                                  ),
                                  subtitle: Text(
                                    '${item.startsAt == null ? '' : _dateTime(item.startsAt!)}\n'
                                    '${item.message?.isNotEmpty == true ? item.message : 'কোনো বার্তা নেই'}',
                                  ),
                                  isThreeLine: true,
                                  trailing: item.status == 'PENDING'
                                      ? FilledButton(
                                          onPressed: () async {
                                            try {
                                              await sheetRef
                                                  .read(jobsRepositoryProvider)
                                                  .acceptApplication(item.id);
                                              sheetRef.invalidate(
                                                jobApplicationsProvider(job.id),
                                              );
                                              sheetRef.invalidate(
                                                assignmentsProvider,
                                              );
                                            } on Object {
                                              if (sheetContext.mounted) {
                                                ScaffoldMessenger.of(
                                                  sheetContext,
                                                ).showSnackBar(
                                                  const SnackBar(
                                                    content: Text(
                                                      'আবেদনটি গ্রহণ করা যায়নি।',
                                                    ),
                                                  ),
                                                );
                                              }
                                            }
                                          },
                                          child: const Text('গ্রহণ'),
                                        )
                                      : Text(_statusBn(item.status)),
                                );
                              },
                            ),
                          ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _showApply(
    BuildContext context,
    WidgetRef ref,
    JobSummary job,
  ) async {
    late final ApplicationEligibility eligibility;
    try {
      eligibility = await ref.read(applicationEligibilityProvider.future);
    } on Object {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'আবেদনের যোগ্যতা যাচাই করা যায়নি। আবার চেষ্টা করুন।',
            ),
          ),
        );
      }
      return;
    }
    if (!context.mounted) return;
    if (!eligibility.canApply) {
      final startVerification = await _showApplicationRequirements(
        context,
        eligibility,
      );
      if (startVerification == true && context.mounted) {
        await context.push(AppRoutes.verificationCapture('IDENTITY'));
      }
      return;
    }
    final amount = TextEditingController(
      text: _taka(job.budgetMaxPoisha ?? job.budgetMinPoisha) ?? '',
    );
    final message = TextEditingController();
    final start = job.startsAt ?? DateTime.now().add(const Duration(days: 1));
    final end = job.endsAt ?? start.add(const Duration(hours: 1));
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('এই কাজে আবেদন করুন'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'পোস্টের সময়: ${_dateTime(start)} – ${_time(end)}',
                ),
              ),
              if (job.isTimeAvailable)
                const ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.event_available, color: KColors.success),
                  title: Text('এই সময়টি আপনার ডিফল্ট সময়ের সঙ্গে মেলে'),
                ),
              if (job.isTimeUnavailable) ...[
                const ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.event_busy, color: KColors.warning),
                  title: Text('এই সময়টি আপনার ডিফল্ট সময়ের বাইরে'),
                  subtitle: Text(
                    'আবেদন করার আগে চাইলে পোস্টের সময়টি আপনার কাজের সময়ে যোগ করুন।',
                  ),
                ),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      try {
                        await ref
                            .read(onboardingRepositoryProvider)
                            .addAvailabilityWindow(start, end);
                        ref.invalidate(jobFeedProvider);
                        if (dialogContext.mounted) Navigator.pop(dialogContext);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'পোস্টের সময়টি আপনার ডিফল্ট কাজের সময়ে যোগ হয়েছে। এখন আবেদন করতে পারবেন।',
                              ),
                            ),
                          );
                        }
                      } on Object {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('কাজের সময় আপডেট করা যায়নি।'),
                            ),
                          );
                        }
                      }
                    },
                    icon: const Icon(Icons.playlist_add),
                    label: const Text('এই পোস্টের সময় যোগ করুন'),
                  ),
                ),
              ],
              const SizedBox(height: KSpacing.md),
              KTextField(
                label: 'প্রস্তাবিত টাকা',
                controller: amount,
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: KSpacing.sm),
              KTextField(label: 'বার্তা (ঐচ্ছিক)', controller: message),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('ফিরুন'),
          ),
          FilledButton(
            onPressed: job.isTimeUnavailable
                ? null
                : () async {
                    final taka = int.tryParse(amount.text);
                    if (taka == null || taka <= 0) return;
                    try {
                      await ref
                          .read(jobsRepositoryProvider)
                          .apply(
                            jobId: job.id,
                            startsAt: start,
                            endsAt: end,
                            proposedPricePoisha: taka * 100,
                            message: message.text,
                          );
                      if (dialogContext.mounted) Navigator.pop(dialogContext);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('আবেদন পাঠানো হয়েছে।')),
                        );
                      }
                    } on Object {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'আবেদন পাঠানো যায়নি। সময়টি যাচাই করুন।',
                            ),
                          ),
                        );
                      }
                    }
                  },
            child: const Text('আবেদন পাঠান'),
          ),
        ],
      ),
    );
  }

  Future<bool?> _showApplicationRequirements(
    BuildContext context,
    ApplicationEligibility eligibility,
  ) => showDialog<bool>(
    context: context,
    builder: (dialogContext) {
      final pending = eligibility.identityStatus == 'PENDING';
      final rejected = eligibility.identityStatus == 'REJECTED';
      return AlertDialog(
        title: const Text('আবেদনের আগে পরিচয় যাচাই করুন'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                pending
                    ? 'আপনার NID ও সেলফি পর্যালোচনাধীন। অনুমোদন হলে আবেদন করতে পারবেন।'
                    : rejected
                    ? 'আগের যাচাই অনুমোদিত হয়নি। পরিষ্কার NID ও নতুন সেলফি দিয়ে আবার জমা দিন।'
                    : 'নিরাপদে কাজ পেতে নিচের আবশ্যিক তথ্য যাচাই সম্পন্ন করুন।',
              ),
              const SizedBox(height: KSpacing.md),
              _EligibilityRow(
                label: 'ফোন নম্বর',
                verified: eligibility.phoneVerified,
              ),
              _EligibilityRow(
                label: 'পরিচয় তথ্য',
                verified: eligibility.identityInformationVerified,
              ),
              _EligibilityRow(
                label: 'জাতীয় পরিচয়পত্র (NID)',
                verified: eligibility.nidVerified,
              ),
              _EligibilityRow(
                label: 'সেলফি',
                verified: eligibility.selfieVerified,
              ),
              const Divider(height: KSpacing.lg),
              const _EligibilityRow(label: 'অভিজ্ঞতা', optional: true),
              const _EligibilityRow(
                label: 'দক্ষতা / বিশেষজ্ঞতা',
                optional: true,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('পরে'),
          ),
          if (!pending)
            FilledButton.icon(
              onPressed: () => Navigator.pop(dialogContext, true),
              icon: const Icon(Icons.verified_user_outlined),
              label: Text(rejected ? 'আবার যাচাই করুন' : 'যাচাই শুরু করুন'),
            ),
        ],
      );
    },
  );
}

class _EligibilityRow extends StatelessWidget {
  const _EligibilityRow({
    required this.label,
    this.verified = false,
    this.optional = false,
  });

  final String label;
  final bool verified;
  final bool optional;

  @override
  Widget build(BuildContext context) => ListTile(
    dense: true,
    contentPadding: EdgeInsets.zero,
    leading: Icon(
      optional
          ? Icons.add_circle_outline
          : verified
          ? Icons.check_circle
          : Icons.radio_button_unchecked,
      color: optional
          ? KColors.primary
          : verified
          ? KColors.success
          : KColors.warning,
    ),
    title: Text(label),
    trailing: Text(
      optional
          ? 'ঐচ্ছিক'
          : verified
          ? 'সম্পন্ন'
          : 'আবশ্যিক',
    ),
  );
}

class _JobCard extends StatelessWidget {
  const _JobCard({
    required this.job,
    required this.actionLabel,
    required this.onAction,
  });

  final String? actionLabel;
  final JobSummary job;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    clipBehavior: Clip.antiAlias,
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: KColors.primary.withValues(alpha: .1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.work_outline, color: KColors.primary),
              ),
              if (job.matchScore case final score? when score > 0)
                Padding(
                  padding: const EdgeInsets.only(left: KSpacing.xs),
                  child: Chip(
                    visualDensity: VisualDensity.compact,
                    avatar: const Icon(Icons.auto_awesome, size: 16),
                    label: Text('$score%'),
                  ),
                ),
            ],
          ),
          const SizedBox(height: KSpacing.sm),
          Text(
            job.title,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: KSpacing.xs),
          Text(
            '${job.categoryName} · ${job.locationName}',
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: KSpacing.xs),
          Text(
            job.description,
            textAlign: TextAlign.center,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
          if (job.matchReasons.isNotEmpty)
            Text(
              _matchReasonBn(job.matchReasons.first),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: KColors.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          const Spacer(),
          if (job.startsAt != null)
            Text(
              'পোস্টের সময়: ${_dateTime(job.startsAt!)}',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          if (job.isTimeAvailable)
            const Text(
              '✓ আপনার সময়ে মেলে',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: KColors.success,
                fontWeight: FontWeight.w600,
              ),
            )
          else if (job.isTimeUnavailable)
            const Text(
              'সময় যোগ করলে আবেদন করা যাবে',
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: KColors.warning,
                fontWeight: FontWeight.w600,
              ),
            ),
          if (_taka(job.budgetMaxPoisha ?? job.budgetMinPoisha)
              case final amount?)
            Text(
              '৳$amount',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          if (actionLabel != null) ...[
            const SizedBox(height: KSpacing.sm),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: onAction,
                child: Text(actionLabel!),
              ),
            ),
          ],
        ],
      ),
    ),
  );
}

class CreateJobScreen extends ConsumerStatefulWidget {
  const CreateJobScreen({super.key});

  @override
  ConsumerState<CreateJobScreen> createState() => _CreateJobScreenState();
}

class _CreateJobScreenState extends ConsumerState<CreateJobScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _amount = TextEditingController();
  String? _categoryId;
  String? _skillId;
  DateTime _date = DateTime.now().add(const Duration(days: 1));
  TimeOfDay _start = const TimeOfDay(hour: 9, minute: 0);
  TimeOfDay _end = const TimeOfDay(hour: 11, minute: 0);
  bool _saving = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final categories =
        ref.watch(categoryTreeProvider).value ?? const <CatalogCategory>[];
    final allSkills =
        ref.watch(catalogSkillsProvider).value ?? const <CatalogSkill>[];
    final skills = allSkills
        .where((item) => item.categoryId == _categoryId)
        .toList();
    return Scaffold(
      appBar: AppBar(title: const Text('নতুন কাজ পোস্ট করুন')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(KSpacing.lg),
          children: [
            KTextField(
              label: 'কাজের শিরোনাম',
              controller: _title,
              validator: (value) => (value?.trim().length ?? 0) < 5
                  ? 'কমপক্ষে ৫ অক্ষরের শিরোনাম লিখুন'
                  : null,
            ),
            const SizedBox(height: KSpacing.md),
            KTextField(
              label: 'কাজের বিস্তারিত',
              controller: _description,
              validator: (value) => (value?.trim().length ?? 0) < 20
                  ? 'কমপক্ষে ২০ অক্ষরে বিস্তারিত লিখুন'
                  : null,
            ),
            const SizedBox(height: KSpacing.md),
            DropdownButtonFormField<String>(
              initialValue: _categoryId,
              decoration: const InputDecoration(labelText: 'কাজের ধরন'),
              items: categories
                  .map(
                    (item) => DropdownMenuItem(
                      value: item.id,
                      child: Text(item.nameBn),
                    ),
                  )
                  .toList(),
              onChanged: (value) => setState(() {
                _categoryId = value;
                _skillId = null;
              }),
              validator: (value) => value == null ? 'কাজের ধরন বেছে নিন' : null,
            ),
            const SizedBox(height: KSpacing.md),
            DropdownButtonFormField<String>(
              initialValue: _skillId,
              decoration: const InputDecoration(labelText: 'কাজের উপধরন'),
              items: skills
                  .map(
                    (item) => DropdownMenuItem(
                      value: item.id,
                      child: Text(item.nameBn),
                    ),
                  )
                  .toList(),
              onChanged: (value) => setState(() => _skillId = value),
            ),
            const SizedBox(height: KSpacing.md),
            KTextField(
              label: 'পারিশ্রমিক (টাকা)',
              controller: _amount,
              keyboardType: TextInputType.number,
              validator: (value) => (int.tryParse(value ?? '') ?? 0) <= 0
                  ? 'সঠিক টাকার পরিমাণ লিখুন'
                  : null,
            ),
            const SizedBox(height: KSpacing.md),
            _DateTimeRow(
              date: _date,
              start: _start,
              end: _end,
              onDate: () async {
                final value = await showDatePicker(
                  context: context,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                  initialDate: _date,
                );
                if (value != null) setState(() => _date = value);
              },
              onStart: () => _pickTime(true),
              onEnd: () => _pickTime(false),
            ),
            const SizedBox(height: KSpacing.xl),
            KPrimaryButton(
              label: 'প্রকাশ করুন',
              isLoading: _saving,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickTime(bool start) async {
    final value = await showTimePicker(
      context: context,
      initialTime: start ? _start : _end,
    );
    if (value != null) setState(() => start ? _start = value : _end = value);
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final locationId = ref.read(onboardingControllerProvider).locationId;
    if (locationId == null) return;
    final startsAt = _combine(_date, _start);
    final endsAt = _combine(_date, _end);
    if (!endsAt.isAfter(startsAt)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('শেষ সময় শুরুর সময়ের পরে হতে হবে।')),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(jobsRepositoryProvider).createAndPublishJob({
        'title': _title.text.trim(),
        'description': _description.text.trim(),
        'categoryId': _categoryId,
        'skillIds': _skillId == null ? <String>[] : [_skillId],
        'jobType': 'ONE_TIME',
        'paymentModel': 'FIXED',
        'budgetMinPoisha': '${int.parse(_amount.text) * 100}',
        'budgetMaxPoisha': '${int.parse(_amount.text) * 100}',
        'locationId': locationId,
        'startsAt': startsAt.toUtc().toIso8601String(),
        'endsAt': endsAt.toUtc().toIso8601String(),
      });
      ref.invalidate(jobFeedProvider);
      if (mounted) context.pop();
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('কাজ প্রকাশ করা যায়নি। আবার চেষ্টা করুন।'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class WorkerDirectoryScreen extends ConsumerWidget {
  const WorkerDirectoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final workers = ref.watch(workerDirectoryProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('কর্মী ও সময় খুঁজুন')),
      body: workers.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => _Retry(
          label: 'কর্মীর তালিকা লোড হয়নি।',
          onRetry: () => ref.invalidate(workerDirectoryProvider),
        ),
        data: (items) => items.isEmpty
            ? const Center(child: Text('এখনো কোনো কর্মী পাওয়া যায়নি।'))
            : GridView.builder(
                padding: const EdgeInsets.all(KSpacing.md),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: _responsiveGridColumns(context),
                  crossAxisSpacing: KSpacing.md,
                  mainAxisSpacing: KSpacing.md,
                  mainAxisExtent: _workerGridCardHeight(context),
                ),
                itemCount: items.length,
                itemBuilder: (context, index) => _WorkerCard(
                  worker: items[index],
                  onTap: () =>
                      context.push(AppRoutes.workerBooking(items[index].id)),
                ),
              ),
      ),
    );
  }
}

class _WorkerCard extends StatelessWidget {
  const _WorkerCard({required this.worker, required this.onTap});
  final VoidCallback onTap;
  final PublicWorkerProfile worker;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          children: [
            CircleAvatar(
              radius: 30,
              foregroundImage: worker.photoUrl == null
                  ? null
                  : NetworkImage(worker.photoUrl!),
              child: const Icon(Icons.person),
            ),
            const SizedBox(height: KSpacing.sm),
            Text(
              worker.displayName,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            Text(
              worker.areaNameBn ?? '',
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: KSpacing.xs),
            Text(
              '★ ${worker.ratingAverage} · ${worker.completedJobsCount} কাজ',
              textAlign: TextAlign.center,
            ),
            const Spacer(),
            Text(
              worker.skills.take(2).map((item) => item.nameBn).join(', '),
              maxLines: 2,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: KSpacing.sm),
            const Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Icon(Icons.schedule, size: 18),
                SizedBox(width: 4),
                Text('সময় ও বুকিং'),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

class WorkerBookingScreen extends ConsumerStatefulWidget {
  const WorkerBookingScreen({required this.workerId, super.key});
  final String workerId;

  @override
  ConsumerState<WorkerBookingScreen> createState() =>
      _WorkerBookingScreenState();
}

class _WorkerBookingScreenState extends ConsumerState<WorkerBookingScreen> {
  WorkerSlot? _selected;
  bool _saving = false;

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(publicWorkerProfileProvider(widget.workerId));
    final slots = ref.watch(workerSlotsProvider(widget.workerId));
    final favorites = ref.watch(favoriteWorkersProvider);
    final isFavorite =
        favorites.value?.any((item) => item.userId == widget.workerId) ?? false;
    return Scaffold(
      appBar: AppBar(
        title: const Text('সময় বেছে বুক করুন'),
        actions: [
          IconButton(
            tooltip: isFavorite ? 'পছন্দ থেকে সরান' : 'পছন্দে রাখুন',
            onPressed: favorites.isLoading
                ? null
                : () => _toggleFavorite(isFavorite),
            icon: Icon(
              isFavorite ? Icons.favorite_rounded : Icons.favorite_border,
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(KSpacing.lg),
        children: [
          profile.when(
            loading: () => const LinearProgressIndicator(),
            error: (_, _) => const Text('প্রোফাইল লোড হয়নি।'),
            data: (worker) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: CircleAvatar(
                foregroundImage: worker.photoUrl == null
                    ? null
                    : NetworkImage(worker.photoUrl!),
                child: const Icon(Icons.person),
              ),
              title: Text(worker.displayName),
              subtitle: Text(
                [
                  worker.skills.map((item) => item.nameBn).join(', '),
                  if (worker.badges.isNotEmpty)
                    worker.badges.map((item) => item.nameBn).join(' · '),
                ].where((item) => item.isNotEmpty).join('\n'),
              ),
            ),
          ),
          const SizedBox(height: KSpacing.md),
          Text(
            'আগামী ১৪ দিনের খালি সময়',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: KSpacing.sm),
          slots.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, _) => const Text('সময়সূচি লোড করা যায়নি।'),
            data: (items) => items.isEmpty
                ? const Text('এই সময়ে কোনো খালি স্লট নেই।')
                : Wrap(
                    spacing: KSpacing.sm,
                    runSpacing: KSpacing.sm,
                    children: items
                        .map(
                          (slot) => ChoiceChip(
                            selected: _selected == slot,
                            onSelected: (_) => setState(() => _selected = slot),
                            label: Text(
                              '${_dateTime(slot.startsAt)}–${_time(slot.endsAt)}',
                            ),
                          ),
                        )
                        .toList(),
                  ),
          ),
          const SizedBox(height: KSpacing.xl),
          KPrimaryButton(
            label: 'এই সময় বুকিং অনুরোধ করুন',
            isLoading: _saving,
            onPressed: _selected == null ? null : _book,
          ),
        ],
      ),
    );
  }

  Future<void> _book() async {
    final profile = ref
        .read(publicWorkerProfileProvider(widget.workerId))
        .value;
    final onboarding = ref.read(onboardingControllerProvider);
    final skill = profile?.skills.firstOrNull;
    final allSkills =
        ref.read(catalogSkillsProvider).value ?? const <CatalogSkill>[];
    final catalogSkill = allSkills
        .where((item) => item.id == skill?.id)
        .firstOrNull;
    if (_selected == null ||
        onboarding.locationId == null ||
        catalogSkill == null) {
      return;
    }
    final amount = await _askAmount(context);
    if (amount == null) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(jobsRepositoryProvider)
          .requestBooking(
            workerId: widget.workerId,
            title: '${skill?.nameBn ?? 'সেবা'} বুকিং',
            description: 'KAAJ অ্যাপ থেকে নির্বাচিত সময়ে সেবার বুকিং অনুরোধ।',
            categoryId: catalogSkill.categoryId,
            skillId: catalogSkill.id,
            locationId: onboarding.locationId!,
            slot: _selected!,
            offeredPricePoisha: amount * 100,
          );
      ref.invalidate(assignmentsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'বুকিং অনুরোধ পাঠানো হয়েছে। কর্মীর নিশ্চিতকরণের অপেক্ষায়।',
            ),
          ),
        );
      }
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('এই স্লটটি আর খালি নেই বা অনুরোধ পাঠানো যায়নি।'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleFavorite(bool currentlySaved) async {
    try {
      await ref
          .read(jobsRepositoryProvider)
          .setFavorite(widget.workerId, saved: !currentlySaved);
      ref.invalidate(favoriteWorkersProvider);
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('পছন্দের তালিকা বদলানো যায়নি।')),
        );
      }
    }
  }
}

class AssignmentsScreen extends ConsumerWidget {
  const AssignmentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final assignments = ref.watch(assignmentsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('বুকিং ও কাজের অবস্থা')),
      body: assignments.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => _Retry(
          label: 'বুকিং লোড করা যায়নি।',
          onRetry: () => ref.invalidate(assignmentsProvider),
        ),
        data: (items) => items.isEmpty
            ? const Center(child: Text('এখনো কোনো বুকিং বা নির্বাচিত কাজ নেই।'))
            : ListView.separated(
                padding: const EdgeInsets.all(KSpacing.md),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: KSpacing.sm),
                itemBuilder: (context, index) {
                  final item = items[index];
                  return Card(
                    child: ListTile(
                      onTap: () =>
                          context.push(AppRoutes.assignmentDetail(item.id)),
                      leading: Icon(
                        item.status == 'CONFIRMED'
                            ? Icons.event_available
                            : Icons.pending_actions,
                        color: KColors.primary,
                      ),
                      title: Text(item.title),
                      subtitle: Text(
                        '${item.startsAt == null ? '' : _dateTime(item.startsAt!)}\n${_statusBn(item.status)}',
                      ),
                      isThreeLine: true,
                      trailing:
                          item.isWorker && item.status == 'PENDING_CONFIRMATION'
                          ? const Icon(Icons.chevron_right)
                          : const Icon(Icons.chevron_right),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class AssignmentDetailScreen extends ConsumerWidget {
  const AssignmentDetailScreen({required this.assignmentId, super.key});
  final String assignmentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(assignmentDetailProvider(assignmentId));
    return Scaffold(
      appBar: AppBar(title: const Text('কাজের বিস্তারিত ও অগ্রগতি')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => _Retry(
          label: 'কাজের বিস্তারিত লোড করা যায়নি।',
          onRetry: () => ref.invalidate(assignmentDetailProvider(assignmentId)),
        ),
        data: (item) => _AssignmentDetailBody(
          detail: item,
          onChanged: () {
            ref
              ..invalidate(assignmentDetailProvider(assignmentId))
              ..invalidate(assignmentsProvider);
          },
        ),
      ),
    );
  }
}

class _AssignmentDetailBody extends ConsumerWidget {
  const _AssignmentDetailBody({required this.detail, required this.onChanged});
  final AssignmentDetail detail;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final item = detail.summary;
    final reviews = item.status == 'COMPLETED'
        ? ref.watch(assignmentReviewsProvider(item.id))
        : null;
    return ListView(
      padding: const EdgeInsets.all(KSpacing.lg),
      children: [
        Text(item.title, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: KSpacing.xs),
        Text(
          '${detail.locationName} · ${_statusBn(item.jobStatus ?? item.status)}',
        ),
        const SizedBox(height: KSpacing.md),
        Text(detail.description),
        if (item.jobId != null &&
            item.workerUserId != null &&
            item.posterUserId != null) ...[
          const SizedBox(height: KSpacing.sm),
          OutlinedButton.icon(
            onPressed: () => _openChat(context, ref),
            icon: const Icon(Icons.chat_bubble_outline),
            label: const Text('কাজ নিয়ে বার্তা দিন'),
          ),
        ],
        if (item.startsAt != null) ...[
          const SizedBox(height: KSpacing.md),
          Card(
            child: ListTile(
              leading: const Icon(Icons.event_available),
              title: Text(_dateTime(item.startsAt!)),
              subtitle: Text(
                'শেষ ${item.endsAt == null ? '' : _time(item.endsAt!)} · চুক্তি v${detail.contractVersion ?? '-'}',
              ),
            ),
          ),
        ],
        if (item.status == 'CONFIRMED' ||
            {
              'UPCOMING',
              'CHECKED_IN',
              'IN_PROGRESS',
            }.contains(item.jobStatus)) ...[
          const SizedBox(height: KSpacing.sm),
          OutlinedButton.icon(
            onPressed: () => context.push(
              AppRoutes.attendance(
                item.id,
                title: item.title,
                isPoster: item.isPoster,
              ),
            ),
            icon: const Icon(Icons.location_on_outlined),
            label: Text(item.isWorker ? 'চেক-ইন / চেক-আউট' : 'উপস্থিতি দেখুন'),
          ),
        ],
        const SizedBox(height: KSpacing.lg),
        Text('কাজের অগ্রগতি', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: KSpacing.sm),
        ...detail.timeline.map(
          (step) => ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const CircleAvatar(
              radius: 14,
              backgroundColor: KColors.primary,
              child: Icon(Icons.check, size: 16, color: Colors.white),
            ),
            title: Text(_statusBn(step.status)),
            subtitle: Text(_dateTime(step.at)),
          ),
        ),
        const SizedBox(height: KSpacing.lg),
        if (item.isWorker && item.status == 'PENDING_CONFIRMATION') ...[
          KPrimaryButton(
            label: 'কাজটি নিশ্চিত করুন',
            onPressed: () => _run(
              context,
              () => ref.read(jobsRepositoryProvider).confirmAssignment(item.id),
            ),
          ),
          const SizedBox(height: KSpacing.sm),
          OutlinedButton(
            onPressed: () => _run(
              context,
              () => ref.read(jobsRepositoryProvider).declineAssignment(item.id),
            ),
            child: const Text('অনুরোধটি গ্রহণ করব না'),
          ),
        ],
        if (item.isWorker && item.jobStatus == 'IN_PROGRESS')
          KPrimaryButton(
            label: 'কাজ শেষ—গ্রাহকের কাছে পাঠান',
            onPressed: () => _run(
              context,
              () => ref.read(jobsRepositoryProvider).submitWork(item.id),
            ),
          ),
        if (item.isPoster && item.jobStatus == 'CUSTOMER_REVIEW')
          KPrimaryButton(
            label: 'কাজ সম্পন্ন নিশ্চিত করুন',
            onPressed: () => _run(
              context,
              () => ref.read(jobsRepositoryProvider).completeWork(item.id),
            ),
          ),
        if (reviews != null) ...[
          const SizedBox(height: KSpacing.lg),
          Text('রিভিউ', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: KSpacing.sm),
          reviews.when(
            loading: () => const LinearProgressIndicator(),
            error: (_, _) => const Text('রিভিউ তথ্য লোড করা যায়নি।'),
            data: (state) => _ReviewPanel(
              state: state,
              onReview: state.canReview
                  ? () => _leaveReview(context, ref, item.id)
                  : null,
            ),
          ),
          if (item.isPoster && item.workerUserId != null) ...[
            const SizedBox(height: KSpacing.sm),
            OutlinedButton.icon(
              onPressed: () =>
                  context.push(AppRoutes.workerBooking(item.workerUserId!)),
              icon: const Icon(Icons.replay_rounded),
              label: const Text('এই কর্মীকে আবার বুক করুন'),
            ),
          ],
        ],
        if (!{'CANCELLED', 'COMPLETED'}.contains(item.status)) ...[
          const SizedBox(height: KSpacing.sm),
          TextButton.icon(
            onPressed: () => _cancel(context, ref),
            icon: const Icon(Icons.cancel_outlined),
            label: const Text('কাজটি বাতিল করুন'),
          ),
        ],
        if ({
          'SUBMITTED',
          'CUSTOMER_REVIEW',
          'COMPLETED',
        }.contains(item.jobStatus)) ...[
          const SizedBox(height: KSpacing.sm),
          OutlinedButton.icon(
            onPressed: () => context.push(AppRoutes.openDispute(item.id)),
            icon: const Icon(Icons.gavel_outlined),
            label: const Text('বিরোধ খুলুন'),
          ),
        ],
        const SizedBox(height: KSpacing.sm),
        TextButton.icon(
          onPressed: () =>
              context.push(AppRoutes.report('ASSIGNMENT', item.id)),
          icon: const Icon(Icons.report_outlined, color: KColors.danger),
          label: const Text('নিরাপত্তা সমস্যা রিপোর্ট করুন'),
        ),
      ],
    );
  }

  Future<void> _leaveReview(
    BuildContext context,
    WidgetRef ref,
    String assignmentId,
  ) async {
    final result = await showDialog<({int rating, String comment})>(
      context: context,
      builder: (context) => const _ReviewDialog(),
    );
    if (result == null) return;
    try {
      await ref
          .read(jobsRepositoryProvider)
          .submitReview(
            assignmentId: assignmentId,
            rating: result.rating,
            comment: result.comment,
          );
      ref
        ..invalidate(assignmentReviewsProvider(assignmentId))
        ..invalidate(receivedReviewsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('রিভিউ জমা হয়েছে। উভয় পক্ষ দিলে প্রকাশ হবে।'),
          ),
        );
      }
    } on Object {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('রিভিউ জমা দেওয়া যায়নি।')),
        );
      }
    }
  }

  Future<void> _openChat(BuildContext context, WidgetRef ref) async {
    final item = detail.summary;
    final otherUserId = item.isWorker ? item.posterUserId : item.workerUserId;
    if (item.jobId == null || otherUserId == null) return;
    try {
      final id = await ref
          .read(chatRepositoryProvider)
          .openConversation(jobId: item.jobId!, participantUserId: otherUserId);
      ref.invalidate(conversationsProvider);
      if (context.mounted) {
        await context.push(
          AppRoutes.chatThread(
            id,
            jobTitle: item.title,
            otherName: item.isWorker ? 'কাজের মালিক' : 'কর্মী',
            otherUserId: otherUserId,
          ),
        );
      }
    } on Object {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('আলোচনা এখন খোলা যাচ্ছে না।')),
        );
      }
    }
  }

  Future<void> _run(
    BuildContext context,
    Future<void> Function() action,
  ) async {
    try {
      await action();
      onChanged();
    } on Object {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('কাজটি এখন করা যাচ্ছে না। অবস্থা ও সময় যাচাই করুন।'),
          ),
        );
      }
    }
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    const reasonCode = 'CHANGE_OF_PLAN';
    try {
      final preview = await ref
          .read(jobsRepositoryProvider)
          .cancellationPreview(id: detail.summary.id, reasonCode: reasonCode);
      if (!context.mounted) return;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('বাতিলের আগে ফলাফল দেখুন'),
          content: Text(
            '${preview.summaryBn}\n\nফেরত: ৳${_taka(preview.refundPoisha)} · ফি: ৳${_taka(preview.feePoisha)}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('ফিরুন'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('বাতিল নিশ্চিত করুন'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
      await ref
          .read(jobsRepositoryProvider)
          .cancelAssignment(id: detail.summary.id, reasonCode: reasonCode);
      onChanged();
    } on Object {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('বাতিলের হিসাব বা অনুরোধ সম্পন্ন হয়নি।'),
          ),
        );
      }
    }
  }
}

class _ReviewPanel extends StatelessWidget {
  const _ReviewPanel({required this.state, this.onReview});
  final AssignmentReviewState state;
  final VoidCallback? onReview;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (state.myReview != null)
            Text('আপনার রেটিং: ${_stars(state.myReview!.rating)}'),
          if (!state.revealed && state.myReview != null)
            const Padding(
              padding: EdgeInsets.only(top: KSpacing.sm),
              child: Text(
                'অন্য পক্ষ রিভিউ দিলে, অথবা ৭ দিন শেষে, রিভিউ দেখা যাবে।',
              ),
            ),
          if (state.receivedReview case final review?) ...[
            Text('${review.reviewerName}: ${_stars(review.rating)}'),
            if (review.comment?.isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.only(top: KSpacing.xs),
                child: Text(review.comment!),
              ),
          ],
          if (onReview != null) ...[
            const SizedBox(height: KSpacing.md),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onReview,
                icon: const Icon(Icons.star_outline),
                label: const Text('রিভিউ দিন'),
              ),
            ),
          ],
        ],
      ),
    ),
  );
}

class _ReviewDialog extends StatefulWidget {
  const _ReviewDialog();

  @override
  State<_ReviewDialog> createState() => _ReviewDialogState();
}

class _ReviewDialogState extends State<_ReviewDialog> {
  int rating = 5;
  final comment = TextEditingController();

  @override
  void dispose() {
    comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('অভিজ্ঞতা কেমন ছিল?'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(
            5,
            (index) => IconButton(
              onPressed: () => setState(() => rating = index + 1),
              icon: Icon(
                index < rating ? Icons.star_rounded : Icons.star_border_rounded,
                color: Colors.amber.shade700,
              ),
            ),
          ),
        ),
        TextField(
          controller: comment,
          maxLength: 1000,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'মন্তব্য (ঐচ্ছিক)',
            hintText: 'সময়, কাজের মান ও যোগাযোগ সম্পর্কে লিখুন',
          ),
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('ফিরুন'),
      ),
      FilledButton(
        onPressed: () =>
            Navigator.pop(context, (rating: rating, comment: comment.text)),
        child: const Text('জমা দিন'),
      ),
    ],
  );
}

String _stars(int rating) =>
    '${List.filled(rating, '★').join()}${List.filled(5 - rating, '☆').join()}';

class ReceivedReviewsScreen extends ConsumerWidget {
  const ReceivedReviewsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviews = ref.watch(receivedReviewsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('আমার পাওয়া রিভিউ')),
      body: reviews.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => _Retry(
          label: 'রিভিউ লোড করা যায়নি।',
          onRetry: () => ref.invalidate(receivedReviewsProvider),
        ),
        data: (items) => items.isEmpty
            ? const Center(child: Text('এখনো প্রকাশিত কোনো রিভিউ নেই।'))
            : ListView.separated(
                padding: const EdgeInsets.all(KSpacing.md),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: KSpacing.sm),
                itemBuilder: (context, index) {
                  final review = items[index];
                  return Card(
                    child: ListTile(
                      leading: const CircleAvatar(child: Icon(Icons.person)),
                      title: Text(
                        '${review.reviewerName} · ${_stars(review.rating)}',
                      ),
                      subtitle: review.comment?.isNotEmpty == true
                          ? Text(review.comment!)
                          : const Text('কোনো মন্তব্য দেওয়া হয়নি।'),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class FavoriteWorkersScreen extends ConsumerWidget {
  const FavoriteWorkersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favorites = ref.watch(favoriteWorkersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('পছন্দের কর্মী')),
      body: favorites.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => _Retry(
          label: 'পছন্দের তালিকা লোড করা যায়নি।',
          onRetry: () => ref.invalidate(favoriteWorkersProvider),
        ),
        data: (items) => items.isEmpty
            ? const Center(child: Text('এখনো কোনো কর্মী পছন্দে রাখা হয়নি।'))
            : ListView.builder(
                padding: const EdgeInsets.all(KSpacing.md),
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final worker = items[index];
                  return Card(
                    child: ListTile(
                      leading: const CircleAvatar(child: Icon(Icons.person)),
                      title: Text(worker.displayName),
                      subtitle: Text('★ ${worker.ratingAverage}'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () =>
                          context.push(AppRoutes.workerBooking(worker.userId)),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class _DateTimeRow extends StatelessWidget {
  const _DateTimeRow({
    required this.date,
    required this.start,
    required this.end,
    required this.onDate,
    required this.onStart,
    required this.onEnd,
  });
  final DateTime date;
  final TimeOfDay end;
  final VoidCallback onDate;
  final VoidCallback onEnd;
  final VoidCallback onStart;
  final TimeOfDay start;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      ListTile(
        leading: const Icon(Icons.calendar_today),
        title: const Text('কাজের দিন'),
        subtitle: Text('${date.day}/${date.month}/${date.year}'),
        onTap: onDate,
      ),
      Row(
        children: [
          Expanded(
            child: ListTile(
              title: const Text('শুরু'),
              subtitle: Text(start.format(context)),
              onTap: onStart,
            ),
          ),
          Expanded(
            child: ListTile(
              title: const Text('শেষ'),
              subtitle: Text(end.format(context)),
              onTap: onEnd,
            ),
          ),
        ],
      ),
    ],
  );
}

class _Retry extends StatelessWidget {
  const _Retry({required this.label, required this.onRetry});
  final String label;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label),
        const SizedBox(height: KSpacing.sm),
        FilledButton(onPressed: onRetry, child: const Text('আবার চেষ্টা করুন')),
      ],
    ),
  );
}

int _responsiveGridColumns(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  final textScale = MediaQuery.textScalerOf(context).scale(16) / 16;
  if (width < 400) return 1;
  if (width < 680 && textScale >= 1.5) return 1;
  return width >= 680 ? 3 : 2;
}

double _jobGridCardHeight(BuildContext context) {
  final scale = (MediaQuery.textScalerOf(context).scale(16) / 16).clamp(1, 2);
  final accessible = _responsiveGridColumns(context) == 1;
  return 424 + ((scale - 1) * (accessible ? 356 : 160));
}

double _workerGridCardHeight(BuildContext context) {
  final scale = (MediaQuery.textScalerOf(context).scale(16) / 16).clamp(1, 2);
  final accessible = _responsiveGridColumns(context) == 1;
  return 300 + ((scale - 1) * (accessible ? 200 : 96));
}

Future<int?> _askAmount(BuildContext context) async {
  final controller = TextEditingController();
  final result = await showDialog<int>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('প্রস্তাবিত পারিশ্রমিক'),
      content: KTextField(
        label: 'টাকা',
        controller: controller,
        keyboardType: TextInputType.number,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('ফিরুন'),
        ),
        FilledButton(
          onPressed: () {
            final value = int.tryParse(controller.text);
            if (value != null && value > 0) Navigator.pop(context, value);
          },
          child: const Text('অনুরোধ পাঠান'),
        ),
      ],
    ),
  );
  controller.dispose();
  return result;
}

DateTime _combine(DateTime date, TimeOfDay time) =>
    DateTime(date.year, date.month, date.day, time.hour, time.minute);
String _dateTime(DateTime value) {
  final local = value.toLocal();
  return '${local.day}/${local.month} ${_time(local)}';
}

String _time(DateTime value) {
  final local = value.toLocal();
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}

String? _taka(String? poisha) {
  final value = int.tryParse(poisha ?? '');
  return value == null ? null : (value ~/ 100).toString();
}

String _matchReasonBn(String reason) => switch (reason) {
  'Skills match' => 'আপনার দক্ষতার সঙ্গে মেলে',
  'Nearby service area' => 'আপনার কাছাকাছি কাজ',
  'Available for this time' => 'আপনার খালি সময়ের সঙ্গে মেলে',
  'Rate fits the budget' => 'পারিশ্রমিক আপনার রেটের সঙ্গে মেলে',
  'Relevant experience' => 'আপনার অভিজ্ঞতার সঙ্গে মেলে',
  'Strong worker rating' => 'রেটিং অনুযায়ী ভালো মিল',
  'Reliable work history' => 'নির্ভরযোগ্যতার সঙ্গে মেলে',
  _ => reason,
};

String _statusBn(String status) => switch (status) {
  'DRAFT' => 'খসড়া',
  'PUBLISHED' => 'প্রকাশিত',
  'APPLICATIONS_OPEN' => 'আবেদন চলছে',
  'WORKER_SELECTED' => 'কর্মী নির্বাচিত',
  'CONFIRMATION_PENDING' => 'কর্মীর নিশ্চিতকরণের অপেক্ষায়',
  'PENDING_CONFIRMATION' => 'নিশ্চিতকরণের অপেক্ষায়',
  'PENDING' => 'অপেক্ষায়',
  'ACCEPTED' => 'গৃহীত',
  'REJECTED' => 'প্রত্যাখ্যাত',
  'WITHDRAWN' => 'প্রত্যাহার করা হয়েছে',
  'CONFIRMED' => 'নিশ্চিত হয়েছে',
  'UPCOMING' => 'শিগগির শুরু হবে',
  'CHECKED_IN' => 'কর্মী উপস্থিত',
  'IN_PROGRESS' => 'কাজ চলছে',
  'SUBMITTED' => 'কাজ জমা হয়েছে',
  'CUSTOMER_REVIEW' => 'গ্রাহকের পর্যালোচনায়',
  'PAYMENT_RELEASED' => 'কাজ সম্পন্ন ও হিসাব চূড়ান্ত',
  'REVIEWED' => 'পর্যালোচনা সম্পন্ন',
  'EXPIRED' => 'সময় শেষ',
  'CANCELLED_BY_CUSTOMER' => 'গ্রাহক বাতিল করেছেন',
  'CANCELLED_BY_WORKER' => 'কর্মী বাতিল করেছেন',
  'DISPUTED' => 'বিরোধ পর্যালোচনায়',
  'SUSPENDED' => 'স্থগিত',
  'DECLINED' => 'বাতিল হয়েছে',
  'CANCELLED' => 'বাতিল হয়েছে',
  'COMPLETED' => 'সম্পন্ন',
  _ => status,
};

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/failure_copy.dart';
import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/location/location_gateway.dart';
import '../../../../core/permissions/permission_gateway.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/routing/route_arguments.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../../core/widgets/k_primary_button.dart';
import '../../../../core/widgets/k_text_field.dart';
import '../../../../core/widgets/load_more.dart';
import '../../../catalog/domain/entities/catalog_category.dart';
import '../../../catalog/domain/entities/catalog_skill.dart';
import '../../../catalog/presentation/controllers/catalog_providers.dart';
import '../../../chat/presentation/controllers/chat_providers.dart';
import '../../../onboarding/domain/onboarding_state.dart';
import '../../../profile/domain/public_worker_profile.dart';
import '../../../profile/presentation/controllers/me_provider.dart';
import '../../../profile/presentation/controllers/public_profile_provider.dart';
import '../../../trust_safety/presentation/trust_safety_providers.dart';
import '../../data/jobs_repository.dart';
import '../../domain/job_alert_errors.dart';
import '../../domain/job_models.dart';
import '../controllers/jobs_providers.dart';
import '../widgets/applicant_card.dart';
import '../widgets/apply_flow.dart';
import '../widgets/opportunity_listing.dart';
import '../widgets/review_dialog.dart';

// Kept importable from here for existing callers.
export '../widgets/apply_flow.dart' show showJobApplyFlow;

class JobFeedScreen extends ConsumerStatefulWidget {
  const JobFeedScreen({
    this.categoryId,
    this.categoryName,
    this.skillId,
    this.skillName,
    this.locationId,
    this.locationName,
    this.initialAvailableOnly = false,
    this.embedded = false,
    this.searchQuery = '',
    super.key,
  });

  /// Shown inside Explore: no app bar of its own.
  final bool embedded;

  /// Filters the loaded posts by title, description, type and area.
  final String searchQuery;

  final String? categoryId;
  final String? categoryName;
  final String? skillId;
  final String? skillName;

  /// Only jobs in this area, for "Near you".
  final String? locationId;
  final String? locationName;

  /// Start with "fits my time" on, for "Jobs matching your availability".
  final bool initialAvailableOnly;

  @override
  ConsumerState<JobFeedScreen> createState() => _JobFeedScreenState();
}

class _JobFeedScreenState extends ConsumerState<JobFeedScreen> {
  late bool _availableOnly = widget.initialAvailableOnly;
  bool _creatingAlert = false;
  final _more = MorePages<JobSummary>();

  Future<void> _createAlert() async {
    setState(() => _creatingAlert = true);
    try {
      await ref
          .read(jobsRepositoryProvider)
          .createJobAlert(
            categoryId: widget.skillId == null ? widget.categoryId : null,
            skillId: widget.skillId,
          );
      ref.invalidate(jobAlertsProvider);
      if (mounted) {
        _feedSnack('কাজের সতর্কতা চালু হয়েছে। মিলে গেলে নোটিফিকেশন পাবেন।');
      }
    } on Object catch (error) {
      if (mounted) _feedSnack(jobAlertFailureMessage(error));
    } finally {
      if (mounted) setState(() => _creatingAlert = false);
    }
  }

  Future<void> _publishDraft(String jobId) async {
    final published = await publishDraftJob(context, ref, jobId);
    if (published && mounted) _feedSnack('কাজটি প্রকাশ করা হয়েছে।');
  }

  void _feedSnack(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: KLocalizedText(message)));

  @override
  Widget build(BuildContext context) {
    final isWorker = ref.watch(meRoleProvider) == KaajRole.worker;
    final browsingType = widget.categoryId != null || widget.skillId != null;
    final showOpenJobs = isWorker || browsingType;
    final filter = JobFeedFilter(
      categoryId: widget.categoryId,
      skillId: widget.skillId,
      locationId: widget.locationId,
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
      appBar: widget.embedded
          ? null
          : AppBar(
              title: KLocalizedText(
                widget.skillName ??
                    widget.categoryName ??
                    widget.locationName ??
                    (isWorker ? 'কাজ খুঁজুন' : 'আমার পোস্ট করা কাজ'),
              ),
              actions: [
                if (isWorker)
                  IconButton(
                    tooltip: KaajLocalizations.text(context, 'কাজের সতর্কতা'),
                    onPressed: () => context.push(AppRoutes.jobAlerts),
                    icon: const Icon(Icons.notifications_active_outlined),
                  ),
                IconButton(
                  tooltip: KaajLocalizations.text(
                    context,
                    'কাজের তালিকা হালনাগাদ করুন',
                  ),
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
              label: const KLocalizedText('কাজ পোস্ট করুন'),
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
                      child: KLocalizedText(
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
                      label: KLocalizedText(
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
          if (isWorker && browsingType)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                KSpacing.md,
                KSpacing.xs,
                KSpacing.md,
                0,
              ),
              child: Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  key: const ValueKey('notify-similar-jobs'),
                  onPressed: _creatingAlert ? null : _createAlert,
                  icon: const Icon(Icons.notification_add_outlined),
                  label: const KLocalizedText('এমন কাজ এলে আমাকে জানান'),
                ),
              ),
            ),
          Expanded(
            child: jobs.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => RetryPanel(
                error: error,
                label: 'কাজের তালিকা লোড করা যায়নি।',
                onRetry: () => showOpenJobs
                    ? ref.invalidate(feed)
                    : ref.invalidate(myJobsProvider),
              ),
              data: (firstPage) {
                // Only the open feed is paginated; "my jobs" is one list.
                final loaded = showOpenJobs
                    ? _more.merge(firstPage)
                    : firstPage;
                final items = loaded
                    .where(
                      (job) => matchesSearch(widget.searchQuery, [
                        job.title,
                        job.description,
                        job.categoryName,
                        job.categoryNameEn,
                        job.locationName,
                        job.locationNameEn,
                      ]),
                    )
                    .toList(growable: false);
                if (items.isEmpty && loaded.isNotEmpty) {
                  return const NoSearchMatches();
                }
                final hasMore = showOpenJobs && _more.hasMore;
                return RefreshIndicator(
                  onRefresh: refresh,
                  child: items.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            const SizedBox(height: 240),
                            Center(
                              child: KLocalizedText(
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
                          gridDelegate:
                              SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: opportunityGridColumns(context),
                                crossAxisSpacing: KSpacing.md,
                                mainAxisSpacing: KSpacing.md,
                                mainAxisExtent: opportunityCardHeight(context),
                              ),
                          itemCount: items.length + (hasMore ? 1 : 0),
                          itemBuilder: (context, index) {
                            if (index == items.length) {
                              return LoadMoreButton(
                                loading: _more.loading,
                                failed: _more.failed,
                                onPressed: () => _more.loadNext(
                                  (cursor) => ref
                                      .read(jobsRepositoryProvider)
                                      .getJobs(
                                        categoryId: filter.categoryId,
                                        skillId: filter.skillId,
                                        locationId: filter.locationId,
                                        availableOnly: filter.availableOnly,
                                        forMe: filter.forMe,
                                        cursor: cursor,
                                      ),
                                  () {
                                    if (mounted) setState(() {});
                                  },
                                ),
                              );
                            }
                            final job = items[index];
                            final ownDraft =
                                !isWorker &&
                                !browsingType &&
                                job.status == 'DRAFT';
                            return OpportunityCard(
                              job: job,
                              actionLabel: isWorker
                                  ? 'আবেদন'
                                  : browsingType
                                  ? null
                                  : ownDraft
                                  ? 'প্রকাশ করুন'
                                  : 'আবেদন দেখুন',
                              onAction: isWorker
                                  ? () => showJobApplyFlow(context, ref, job)
                                  : browsingType
                                  ? null
                                  : ownDraft
                                  ? () => _publishDraft(job.id)
                                  : () => _showApplications(context, ref, job),
                            );
                          },
                        ),
                );
              },
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
                  KLocalizedText(
                    'ম্যাচ করা কর্মী',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: KSpacing.xs),
                  sheetRef
                      .watch(suggestedWorkersProvider(job.id))
                      .when(
                        loading: () => const LinearProgressIndicator(),
                        error: (error, _) => Text(
                          failureText(
                            context,
                            error,
                            'পরামর্শ লোড করা যায়নি।',
                          ),
                        ),
                        data: (workers) => workers.isEmpty
                            ? const KLocalizedText(
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
                                        child: KLocalizedText(
                                          '${worker.matchScore}%',
                                        ),
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
                      child: KLocalizedText('আবেদনের তালিকা লোড করা যায়নি।'),
                    ),
                    data: (items) => items.isEmpty
                        ? const Padding(
                            padding: EdgeInsets.all(KSpacing.lg),
                            child: KLocalizedText('এখনো কেউ আবেদন করেননি।'),
                          )
                        : Flexible(
                            child: ListView.separated(
                              shrinkWrap: true,
                              itemCount: items.length,
                              separatorBuilder: (_, _) =>
                                  const SizedBox(height: KSpacing.sm),
                              itemBuilder: (context, index) {
                                final item = items[index];
                                return ApplicantCard(
                                  application: item,
                                  statusLabel: _statusBn(item.status),
                                  onViewProfile: () => context.push(
                                    AppRoutes.workerProfile(item.workerUserId),
                                  ),
                                  onAccept: item.status != 'PENDING'
                                      ? null
                                      : () async {
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
                                          } on Object catch (error) {
                                            if (sheetContext.mounted) {
                                              showFailureSnack(
                                                sheetContext,
                                                error,
                                                'আবেদনটি গ্রহণ করা যায়নি।',
                                              );
                                            }
                                          }
                                        },
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
}

class CreateJobScreen extends ConsumerStatefulWidget {
  const CreateJobScreen({
    super.key,
    this.permissionGateway = const PermissionGateway(),
  });

  final PermissionGateway permissionGateway;

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
  // Optional work-site pin. Worker GPS check-in is measured against it;
  // without one, attendance needs a manual override.
  KLocation? _site;
  bool _pinning = false;
  static const _maxSiteAccuracyM = 100.0;

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
      appBar: AppBar(title: const KLocalizedText('নতুন কাজ পোস্ট করুন')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            KSpacing.md,
            KSpacing.sm,
            KSpacing.md,
            KSpacing.xl,
          ),
          children: [
            KLocalizedText(
              'কাজটি কী?',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: KSpacing.sm),
            KTextField(
              label: 'কাজের শিরোনাম',
              controller: _title,
              textInputAction: TextInputAction.next,
              validator: (value) => (value?.trim().length ?? 0) < 5
                  ? 'কমপক্ষে ৫ অক্ষরের শিরোনাম লিখুন'
                  : null,
            ),
            const SizedBox(height: KSpacing.md),
            KTextField(
              label: 'কাজের বিস্তারিত',
              controller: _description,
              minLines: 3,
              maxLines: 5,
              textInputAction: TextInputAction.newline,
              validator: (value) => (value?.trim().length ?? 0) < 20
                  ? 'কমপক্ষে ২০ অক্ষরে বিস্তারিত লিখুন'
                  : null,
            ),
            const SizedBox(height: KSpacing.md),
            DropdownButtonFormField<String>(
              initialValue: _categoryId,
              decoration: InputDecoration(
                labelText: KaajLocalizations.text(context, 'কাজের ধরন'),
              ),
              items: categories
                  .map(
                    (item) => DropdownMenuItem(
                      value: item.id,
                      child: KLocalizedText(
                        item.nameFor(
                          Localizations.localeOf(context).languageCode,
                        ),
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (value) => setState(() {
                _categoryId = value;
                _skillId = null;
              }),
              validator: (value) => value == null
                  ? KaajLocalizations.text(context, 'কাজের ধরন বেছে নিন')
                  : null,
            ),
            const SizedBox(height: KSpacing.md),
            DropdownButtonFormField<String>(
              initialValue: _skillId,
              decoration: InputDecoration(
                labelText: KaajLocalizations.text(context, 'কাজের উপধরন'),
              ),
              items: skills
                  .map(
                    (item) => DropdownMenuItem(
                      value: item.id,
                      child: KLocalizedText(
                        item.nameFor(
                          Localizations.localeOf(context).languageCode,
                        ),
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (value) => setState(() => _skillId = value),
            ),
            const SizedBox(height: KSpacing.md),
            KLocalizedText(
              'কোথায় এবং কখন?',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: KSpacing.sm),
            Card(
              child: _DateTimeRow(
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
            ),
            const SizedBox(height: KSpacing.sm),
            Card(
              child: ListTile(
                leading: Icon(
                  _site == null
                      ? Icons.add_location_alt_outlined
                      : Icons.where_to_vote_outlined,
                ),
                title: KLocalizedText(
                  _site == null
                      ? 'কাজের জায়গা পিন করুন'
                      : 'কাজের জায়গা পিন করা হয়েছে',
                ),
                subtitle: KLocalizedText(
                  _site == null
                      // Without a pin nothing can measure the arrival of the
                      // worker, so the poster confirms start and end.
                      ? 'পিন না করলে কর্মীর পৌঁছানো ও কাজ শেষ হওয়া আপনাকেই "উপস্থিতি" থেকে নিশ্চিত করতে হবে। কাজের জায়গায় থাকলে এখনই পিন করুন।'
                      : 'কর্মী এই জায়গায় পৌঁছে চেক-ইন করবেন। এখন কাজের জায়গায় থাকলে তবেই পিন করুন।',
                ),
                trailing: _pinning
                    ? const SizedBox.square(
                        dimension: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : _site == null
                    ? null
                    : TextButton(
                        onPressed: () => setState(() => _site = null),
                        child: const KLocalizedText('পিন সরান'),
                      ),
                onTap: _pinning || _site != null ? null : _pinSite,
              ),
            ),
            const SizedBox(height: KSpacing.md),
            KLocalizedText(
              'পারিশ্রমিক',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: KSpacing.sm),
            KTextField(
              label: 'পারিশ্রমিক (টাকা)',
              controller: _amount,
              keyboardType: TextInputType.number,
              prefixIcon: Icons.payments_outlined,
              validator: (value) => (int.tryParse(value ?? '') ?? 0) <= 0
                  ? 'সঠিক টাকার পরিমাণ লিখুন'
                  : null,
            ),
            const SizedBox(height: KSpacing.lg),
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

  Future<void> _pinSite() async {
    setState(() => _pinning = true);
    try {
      final permission = await widget.permissionGateway.request(
        KPermission.location,
      );
      if (permission != KPermissionStatus.granted) {
        _notify('লোকেশন অনুমতি দিন, তারপর আবার চেষ্টা করুন।');
        return;
      }
      final location = await ref.read(locationGatewayProvider).current();
      // A mocked or vague fix would put the pin where no worker can check in.
      if (location.mockLocation || location.accuracyM > _maxSiteAccuracyM) {
        _notify('লোকেশন পাওয়া যায়নি। খোলা জায়গায় গিয়ে আবার চেষ্টা করুন।');
        return;
      }
      if (mounted) setState(() => _site = location);
    } on Object {
      _notify('লোকেশন পাওয়া যায়নি। খোলা জায়গায় গিয়ে আবার চেষ্টা করুন।');
    } finally {
      if (mounted) setState(() => _pinning = false);
    }
  }

  void _notify(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: KLocalizedText(message)));
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
    // The area comes from the server profile, so changing it in Edit profile
    // is what fixes a missing area, on any phone.
    final locationId = await _serverAreaId(ref);
    if (!mounted) return;
    if (locationId == null) {
      showMissingAreaMessage(
        context,
        'কাজ পোস্ট করার আগে প্রোফাইলে আপনার এলাকা নির্বাচন করুন।',
      );
      return;
    }
    final startsAt = _combine(_date, _start);
    final endsAt = _combine(_date, _end);
    if (!endsAt.isAfter(startsAt)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: KLocalizedText('শেষ সময় শুরুর সময়ের পরে হতে হবে।'),
        ),
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
        // Stored with 6 decimal places (~0.1 m) by the API.
        if (_site case final site?) ...{
          'lat': double.parse(site.latitude.toStringAsFixed(6)),
          'lng': double.parse(site.longitude.toStringAsFixed(6)),
        },
      });
      ref.invalidate(jobFeedProvider);
      ref.invalidate(myJobsProvider);
      if (mounted) context.pop();
    } on JobDraftPublishFailure catch (failure) {
      // The job was saved but not published. Say so, so the poster does not
      // retype the whole form or assume nothing was created, and let them
      // publish it right here or later from My jobs.
      ref.invalidate(myJobsProvider);
      if (mounted) {
        final messenger = ScaffoldMessenger.of(context);
        messenger.showSnackBar(
          SnackBar(
            duration: const Duration(seconds: 10),
            content: const KLocalizedText(
              'কাজটি খসড়া হিসেবে সংরক্ষিত হয়েছে, কিন্তু প্রকাশ করা যায়নি। "আমার কাজ" থেকে আবার প্রকাশ করুন।',
            ),
            action: SnackBarAction(
              label: KaajLocalizations.text(context, 'এখনই প্রকাশ করুন'),
              onPressed: () async {
                final published = await publishDraftJob(
                  context,
                  ref,
                  failure.draftId,
                );
                if (published && mounted) context.pop();
              },
            ),
          ),
        );
      }
    } on Object catch (error) {
      if (mounted) {
        showFailureSnack(
          context,
          error,
          'কাজ প্রকাশ করা যায়নি। আবার চেষ্টা করুন।',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class WorkerDirectoryScreen extends ConsumerWidget {
  const WorkerDirectoryScreen({
    this.embedded = false,
    this.searchQuery = '',
    super.key,
  });

  /// Shown inside Explore: no app bar of its own.
  final bool embedded;

  /// Filters workers by name and skill, in either language.
  final String searchQuery;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final workers = ref.watch(workerDirectoryProvider);
    return Scaffold(
      appBar: embedded
          ? null
          : AppBar(title: const KLocalizedText('কর্মী ও সময় খুঁজুন')),
      body: workers.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => RetryPanel(
          error: error,
          label: 'কর্মীর তালিকা লোড হয়নি।',
          onRetry: () => ref.invalidate(workerDirectoryProvider),
        ),
        data: (all) {
          final items = all
              .where(
                (worker) => matchesSearch(searchQuery, [
                  worker.displayName,
                  for (final skill in worker.skills) ...[
                    skill.nameBn,
                    skill.nameEn,
                  ],
                ]),
              )
              .toList(growable: false);
          if (items.isEmpty && all.isNotEmpty) return const NoSearchMatches();
          return items.isEmpty
              ? const Center(
                  child: KLocalizedText('এখনো কোনো কর্মী পাওয়া যায়নি।'),
                )
              : GridView.builder(
                  padding: const EdgeInsets.all(KSpacing.md),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: opportunityGridColumns(context),
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
                );
        },
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
              worker.displayName.trim().isEmpty
                  ? KaajLocalizations.text(context, 'নাম দেওয়া হয়নি')
                  : worker.displayName,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            KLocalizedText(
              (worker
                          .areaNameFor(
                            Localizations.localeOf(context).languageCode,
                          )
                          ?.trim()
                          .isNotEmpty ??
                      false)
                  ? worker.areaNameFor(
                      Localizations.localeOf(context).languageCode,
                    )!
                  : 'এলাকা দেওয়া হয়নি',
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: KSpacing.xs),
            KLocalizedText(
              '★ ${worker.ratingAverage} · ${worker.completedJobsCount} কাজ',
              textAlign: TextAlign.center,
            ),
            const Spacer(),
            KLocalizedText(
              worker.skills
                  .take(2)
                  .map(
                    (item) => item.nameFor(
                      Localizations.localeOf(context).languageCode,
                    ),
                  )
                  .join(', '),
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
                KLocalizedText('সময় ও বুকিং'),
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
  String? _skillId;
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
        title: const KLocalizedText('সময় বেছে বুক করুন'),
        actions: [
          IconButton(
            tooltip: KaajLocalizations.text(
              context,
              isFavorite ? 'পছন্দ থেকে সরান' : 'পছন্দে রাখুন',
            ),
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
            error: (error, _) =>
                Text(failureText(context, error, 'প্রোফাইল লোড হয়নি।')),
            data: (worker) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: CircleAvatar(
                foregroundImage: worker.photoUrl == null
                    ? null
                    : NetworkImage(worker.photoUrl!),
                child: const Icon(Icons.person),
              ),
              title: Text(worker.displayName),
              subtitle: KLocalizedText(
                [
                  worker.skills
                      .map(
                        (item) => item.nameFor(
                          Localizations.localeOf(context).languageCode,
                        ),
                      )
                      .join(', '),
                  if (worker.badges.isNotEmpty)
                    worker.badges
                        .map(
                          (item) => item.nameFor(
                            Localizations.localeOf(context).languageCode,
                          ),
                        )
                        .join(' · '),
                ].where((item) => item.isNotEmpty).join('\n'),
              ),
            ),
          ),
          ...switch (profile.value?.skills) {
            final skills? when skills.length > 1 => [
              const SizedBox(height: KSpacing.md),
              KLocalizedText(
                'কোন কাজের জন্য বুকিং?',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: KSpacing.sm),
              Wrap(
                spacing: KSpacing.sm,
                runSpacing: KSpacing.sm,
                children: skills
                    .map(
                      (skill) => ChoiceChip(
                        selected: (_skillId ?? skills.first.id) == skill.id,
                        onSelected: (_) => setState(() => _skillId = skill.id),
                        label: KLocalizedText(
                          skill.nameFor(
                            Localizations.localeOf(context).languageCode,
                          ),
                        ),
                      ),
                    )
                    .toList(growable: false),
              ),
            ],
            _ => const <Widget>[],
          },
          const SizedBox(height: KSpacing.md),
          KLocalizedText(
            'আগামী ১৪ দিনের খালি সময়',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: KSpacing.sm),
          slots.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) =>
                Text(failureText(context, error, 'সময়সূচি লোড করা যায়নি।')),
            data: (items) => items.isEmpty
                ? const KLocalizedText('এই সময়ে কোনো খালি স্লট নেই।')
                : Wrap(
                    spacing: KSpacing.sm,
                    runSpacing: KSpacing.sm,
                    children: items
                        .map(
                          (slot) => ChoiceChip(
                            selected: _selected == slot,
                            onSelected: (_) => setState(() => _selected = slot),
                            label: KLocalizedText(
                              '${KFormat.dateTime(context, slot.startsAt)}–${KFormat.time(context, slot.endsAt)}',
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
    final areaId = await _serverAreaId(ref);
    if (!mounted) return;
    if (areaId == null) {
      showMissingAreaMessage(
        context,
        'বুকিং অনুরোধের আগে প্রোফাইলে আপনার এলাকা নির্বাচন করুন।',
      );
      return;
    }
    final skills = profile?.skills ?? const [];
    final skill =
        skills.where((item) => item.id == _skillId).firstOrNull ??
        skills.firstOrNull;
    if (skill == null) {
      _bookingSnack(
        'এই কর্মী এখনো কোনো দক্ষতা যোগ করেননি, তাই বুকিং করা যাচ্ছে না।',
      );
      return;
    }
    List<CatalogSkill> allSkills;
    try {
      allSkills = await ref.read(catalogSkillsProvider.future);
    } on Object {
      allSkills = const [];
    }
    if (!mounted) return;
    final catalogSkill = allSkills
        .where((item) => item.id == skill.id)
        .firstOrNull;
    if (catalogSkill == null) {
      _bookingSnack(
        'এই দক্ষতার জন্য এখন বুকিং করা যাচ্ছে না। অন্য দক্ষতা বেছে নিন।',
      );
      return;
    }
    if (_selected == null) return;
    final amount = await _askAmount(context);
    if (amount == null) return;
    if (!mounted) return;
    final languageCode = Localizations.localeOf(context).languageCode;
    final bookingTitle =
        '${skill.nameFor(languageCode)} ${KaajLocalizations.text(context, 'বুকিং')}';
    final bookingDescription = KaajLocalizations.text(
      context,
      'KAAJ অ্যাপ থেকে নির্বাচিত সময়ে সেবার বুকিং অনুরোধ।',
    );
    setState(() => _saving = true);
    try {
      await ref
          .read(jobsRepositoryProvider)
          .requestBooking(
            workerId: widget.workerId,
            title: bookingTitle,
            description: bookingDescription,
            categoryId: catalogSkill.categoryId,
            skillId: catalogSkill.id,
            locationId: areaId,
            slot: _selected!,
            offeredPricePoisha: amount * 100,
          );
      ref.invalidate(assignmentsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: KLocalizedText(
              'বুকিং অনুরোধ পাঠানো হয়েছে। কর্মীর নিশ্চিতকরণের অপেক্ষায়।',
            ),
          ),
        );
      }
    } on Object catch (error) {
      if (mounted) {
        showFailureSnack(
          context,
          error,
          'এই স্লটটি আর খালি নেই বা অনুরোধ পাঠানো যায়নি।',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _bookingSnack(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: KLocalizedText(message)));

  Future<void> _toggleFavorite(bool currentlySaved) async {
    try {
      await ref
          .read(jobsRepositoryProvider)
          .setFavorite(widget.workerId, saved: !currentlySaved);
      ref.invalidate(favoriteWorkersProvider);
    } on Object catch (error) {
      if (mounted) {
        showFailureSnack(context, error, 'পছন্দের তালিকা বদলানো যায়নি।');
      }
    }
  }
}

/// Re-reads assignments when the app comes back to the foreground: the other
/// person may have checked in, submitted or completed in the meantime.
mixin _RefreshOnResume<T extends ConsumerStatefulWidget>
    on ConsumerState<T>, WidgetsBindingObserver {
  void refreshFromServer();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) refreshFromServer();
  }
}

class AssignmentsScreen extends ConsumerStatefulWidget {
  const AssignmentsScreen({this.embedded = false, super.key});

  /// Shown inside My activity: no app bar of its own.
  final bool embedded;

  @override
  ConsumerState<AssignmentsScreen> createState() => _AssignmentsScreenState();
}

class _AssignmentsScreenState extends ConsumerState<AssignmentsScreen>
    with WidgetsBindingObserver, _RefreshOnResume<AssignmentsScreen> {
  final _more = MorePages<AssignmentSummary>();

  @override
  void refreshFromServer() => ref.invalidate(assignmentsProvider);

  void _loadMore() => _more.loadNext(
    (cursor) => ref.read(jobsRepositoryProvider).getAssignments(cursor: cursor),
    () {
      if (mounted) setState(() {});
    },
  );

  Future<void> _pullToRefresh() async {
    refreshFromServer();
    await ref
        .read(assignmentsProvider.future)
        .catchError((_) => const <AssignmentSummary>[]);
  }

  @override
  Widget build(BuildContext context) {
    final assignments = ref.watch(assignmentsProvider);
    return Scaffold(
      appBar: widget.embedded
          ? null
          : AppBar(title: const KLocalizedText('বুকিং ও কাজের অবস্থা')),
      body: assignments.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => RetryPanel(
          error: error,
          label: 'বুকিং লোড করা যায়নি।',
          onRetry: refreshFromServer,
        ),
        data: (firstPage) {
          final items = _more.merge(firstPage);
          return RefreshIndicator(
            onRefresh: _pullToRefresh,
            child: items.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 240),
                      Center(
                        child: KLocalizedText(
                          'এখনো কোনো বুকিং বা নির্বাচিত কাজ নেই।',
                        ),
                      ),
                    ],
                  )
                : ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(KSpacing.md),
                    itemCount: items.length + (_more.hasMore ? 1 : 0),
                    separatorBuilder: (_, _) =>
                        const SizedBox(height: KSpacing.sm),
                    itemBuilder: (context, index) {
                      if (index == items.length) {
                        return LoadMoreButton(
                          loading: _more.loading,
                          failed: _more.failed,
                          onPressed: _loadMore,
                        );
                      }
                      final item = items[index];
                      return Card(
                        child: ListTile(
                          onTap: () async {
                            await context.push(
                              AppRoutes.assignmentDetail(item.id),
                            );
                            // Whatever happened on the detail shows here too.
                            if (mounted) refreshFromServer();
                          },
                          leading: Icon(
                            item.status == 'CONFIRMED'
                                ? Icons.event_available
                                : Icons.pending_actions,
                            color: KColors.primary,
                          ),
                          title: Text(item.title),
                          // Date and status are localized separately: one
                          // interpolated line is not in the catalog.
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (item.startsAt != null)
                                Text(KFormat.dateTime(context, item.startsAt!)),
                              KLocalizedText(_statusBn(item.displayStatus)),
                            ],
                          ),
                          isThreeLine: true,
                          trailing: const Icon(Icons.chevron_right),
                        ),
                      );
                    },
                  ),
          );
        },
      ),
    );
  }
}

class AssignmentDetailScreen extends ConsumerStatefulWidget {
  const AssignmentDetailScreen({required this.assignmentId, super.key});
  final String assignmentId;

  @override
  ConsumerState<AssignmentDetailScreen> createState() =>
      _AssignmentDetailScreenState();
}

class _AssignmentDetailScreenState extends ConsumerState<AssignmentDetailScreen>
    with WidgetsBindingObserver, _RefreshOnResume<AssignmentDetailScreen> {
  @override
  void refreshFromServer() => refreshAssignments(ref, widget.assignmentId);

  Future<void> _pullToRefresh() async {
    refreshFromServer();
    await ref
        .read(assignmentDetailProvider(widget.assignmentId).future)
        .then<void>((_) {}, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(assignmentDetailProvider(widget.assignmentId));
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('কাজের বিস্তারিত ও অগ্রগতি')),
      body: detail.when(
        // Keep showing the last answer while a refresh is in flight.
        skipLoadingOnRefresh: true,
        skipLoadingOnReload: true,
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => RetryPanel(
          error: error,
          label: 'কাজের বিস্তারিত লোড করা যায়নি।',
          onRetry: refreshFromServer,
        ),
        data: (item) => RefreshIndicator(
          onRefresh: _pullToRefresh,
          child: _AssignmentDetailBody(
            detail: item,
            onChanged: refreshFromServer,
          ),
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
      // Pull-to-refresh works even when the content is short.
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(KSpacing.lg),
      children: [
        Text(item.title, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: KSpacing.xs),
        Text(
          [
            if (detail.locationName.isNotEmpty) detail.locationName,
            KaajLocalizations.text(
              context,
              _statusBn(item.jobStatus ?? item.status),
            ),
          ].join(' · '),
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
            label: const KLocalizedText('কাজ নিয়ে বার্তা দিন'),
          ),
        ],
        if (item.startsAt != null) ...[
          const SizedBox(height: KSpacing.md),
          Card(
            child: ListTile(
              leading: const Icon(Icons.event_available),
              title: KLocalizedText(KFormat.dateTime(context, item.startsAt!)),
              subtitle: KLocalizedText(
                'শেষ ${item.endsAt == null ? '' : KFormat.time(context, item.endsAt!)} · চুক্তি v${detail.contractVersion ?? '-'}',
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
            onPressed: () async {
              await context.push(
                AppRoutes.attendance(item.id),
                extra: AttendanceArgs(
                  title: item.title,
                  isPoster: item.isPoster,
                ),
              );
              // Check-in and check-out change the job; show it on return.
              onChanged();
            },
            icon: const Icon(Icons.location_on_outlined),
            label: KLocalizedText(
              item.isWorker ? 'চেক-ইন / চেক-আউট' : 'উপস্থিতি দেখুন',
            ),
          ),
        ],
        const SizedBox(height: KSpacing.lg),
        KLocalizedText(
          'কাজের অগ্রগতি',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: KSpacing.sm),
        ...detail.timeline.map(
          (step) => ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const CircleAvatar(
              radius: 14,
              backgroundColor: KColors.primary,
              child: Icon(Icons.check, size: 16, color: Colors.white),
            ),
            title: KLocalizedText(_statusBn(step.status)),
            subtitle: KLocalizedText(KFormat.dateTime(context, step.at)),
          ),
        ),
        if (detail.payment != null || item.status == 'COMPLETED') ...[
          const SizedBox(height: KSpacing.lg),
          _CashPaymentPanel(
            payment: detail.payment,
            isPoster: item.isPoster,
            canRecord:
                item.isPoster &&
                item.jobStatus == 'COMPLETED' &&
                detail.payment?.status != 'CASH_RECORDED',
            onRecord: () => _recordCashPayment(context, ref),
          ),
        ],
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
            child: const KLocalizedText('অনুরোধটি গ্রহণ করব না'),
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
          KLocalizedText(
            'রিভিউ',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: KSpacing.sm),
          reviews.when(
            loading: () => const LinearProgressIndicator(),
            error: (error, _) =>
                Text(failureText(context, error, 'রিভিউ তথ্য লোড করা যায়নি।')),
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
              label: const KLocalizedText('এই কর্মীকে আবার বুক করুন'),
            ),
          ],
        ],
        if (!{'CANCELLED', 'COMPLETED'}.contains(item.status)) ...[
          const SizedBox(height: KSpacing.sm),
          TextButton.icon(
            onPressed: () => _cancel(context, ref),
            icon: const Icon(Icons.cancel_outlined),
            label: const KLocalizedText('কাজটি বাতিল করুন'),
          ),
        ],
        // The server decides when a dispute is allowed; older servers do
        // not say, so the job-status rule stays as the fallback.
        if (item.canDispute ??
            {
              'SUBMITTED',
              'CUSTOMER_REVIEW',
              'COMPLETED',
              'PAYMENT_RECORDED',
            }.contains(item.jobStatus)) ...[
          const SizedBox(height: KSpacing.sm),
          OutlinedButton.icon(
            onPressed: () async {
              await context.push(AppRoutes.openDispute(item.id));
              onChanged();
            },
            icon: const Icon(Icons.gavel_outlined),
            label: const KLocalizedText('বিরোধ খুলুন'),
          ),
        ],
        const SizedBox(height: KSpacing.sm),
        TextButton.icon(
          onPressed: () =>
              context.push(AppRoutes.report('ASSIGNMENT', item.id)),
          icon: const Icon(Icons.report_outlined, color: KColors.danger),
          label: const KLocalizedText('নিরাপত্তা সমস্যা রিপোর্ট করুন'),
        ),
      ],
    );
  }

  Future<void> _leaveReview(
    BuildContext context,
    WidgetRef ref,
    String assignmentId,
  ) async {
    final result = await showDialog<ReviewInput>(
      context: context,
      builder: (context) => const ReviewDialog(),
    );
    if (result == null) return;
    try {
      await ref
          .read(jobsRepositoryProvider)
          .submitReview(assignmentId: assignmentId, review: result);
      ref
        ..invalidate(assignmentReviewsProvider(assignmentId))
        ..invalidate(receivedReviewsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: KLocalizedText(
              'রিভিউ জমা হয়েছে। উভয় পক্ষ দিলে প্রকাশ হবে।',
            ),
          ),
        );
      }
    } on Object catch (error) {
      if (context.mounted) {
        showFailureSnack(context, error, 'রিভিউ জমা দেওয়া যায়নি।');
      }
    }
  }

  Future<void> _recordCashPayment(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const KLocalizedText('নগদ পেমেন্ট হয়েছে?'),
        content: const KLocalizedText(
          'কর্মীকে সরাসরি পুরো টাকা দেওয়ার পর নিশ্চিত করুন। KAAJ টাকা গ্রহণ করবে না এবং কোনো কমিশন কাটবে না।',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const KLocalizedText('ফিরুন'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const KLocalizedText('পেমেন্ট হয়েছে'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await ref.read(jobsRepositoryProvider).markCashPaid(detail.summary.id);
      onChanged();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: KLocalizedText('নগদ পেমেন্ট রেকর্ড হয়েছে।')),
        );
      }
    } on Object catch (error) {
      if (context.mounted) {
        showFailureSnack(context, error, 'পেমেন্ট এখন রেকর্ড করা যায়নি।');
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
          AppRoutes.chatThread(id),
          extra: ChatThreadArgs(
            jobTitle: item.title,
            otherName: item.isWorker ? 'কাজের মালিক' : 'কর্মী',
            otherUserId: otherUserId,
          ),
        );
      }
    } on Object catch (error) {
      if (context.mounted) {
        showFailureSnack(context, error, 'আলোচনা এখন খোলা যাচ্ছে না।');
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
    } on Object catch (error) {
      if (context.mounted) {
        showFailureSnack(
          context,
          error,
          'কাজটি এখন করা যাচ্ছে না। অবস্থা ও সময় যাচাই করুন।',
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
          title: const KLocalizedText('বাতিলের আগে ফলাফল দেখুন'),
          content: KLocalizedText(
            '${preview.summaryFor(Localizations.localeOf(context).languageCode)}\n\n${KaajLocalizations.text(context, 'ফেরত')}: ${KFormat.money(context, preview.refundPoisha)} · ${KaajLocalizations.text(context, 'ফি')}: ${KFormat.money(context, preview.feePoisha)}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const KLocalizedText('ফিরুন'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const KLocalizedText('বাতিল নিশ্চিত করুন'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
      await ref
          .read(jobsRepositoryProvider)
          .cancelAssignment(id: detail.summary.id, reasonCode: reasonCode);
      onChanged();
    } on Object catch (error) {
      if (context.mounted) {
        showFailureSnack(
          context,
          error,
          'বাতিলের হিসাব বা অনুরোধ সম্পন্ন হয়নি।',
        );
      }
    }
  }
}

class _CashPaymentPanel extends StatelessWidget {
  const _CashPaymentPanel({
    required this.payment,
    required this.isPoster,
    required this.canRecord,
    required this.onRecord,
  });

  final bool canRecord;
  final bool isPoster;
  final VoidCallback onRecord;
  final AssignmentPayment? payment;

  @override
  Widget build(BuildContext context) {
    final status = payment?.status ?? 'PENDING';
    final paid = status == 'CASH_RECORDED';
    final disputed = status == 'DISPUTED';
    final color = paid
        ? KColors.success
        : disputed
        ? KColors.danger
        : KColors.warning;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: color.withValues(alpha: .12),
                  child: Icon(Icons.payments_outlined, color: color),
                ),
                const SizedBox(width: KSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      KLocalizedText(
                        isPoster ? 'কর্মীকে পেমেন্ট' : 'কাজের পেমেন্ট',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      KLocalizedText(
                        paid
                            ? 'নগদ পেমেন্ট হয়েছে'
                            : disputed
                            ? 'পেমেন্ট নিয়ে বিরোধ চলছে'
                            : 'নগদ পেমেন্ট অপেক্ষমাণ',
                        style: TextStyle(color: color),
                      ),
                    ],
                  ),
                ),
                if (payment != null)
                  Text(
                    KFormat.money(context, payment!.agreedPoisha),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
              ],
            ),
            const SizedBox(height: KSpacing.sm),
            const KLocalizedText(
              'টাকা সরাসরি নগদে লেনদেন হবে। KAAJ শুধু উভয় পক্ষের কাজের রেকর্ড সংরক্ষণ করে।',
              style: TextStyle(color: KColors.textSecondary),
            ),
            if (canRecord) ...[
              const SizedBox(height: KSpacing.md),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: onRecord,
                  icon: const Icon(Icons.check_circle_outline),
                  label: const KLocalizedText(
                    'পেমেন্ট হয়েছে বলে চিহ্নিত করুন',
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
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
            KLocalizedText('আপনার রেটিং: ${_stars(state.myReview!.rating)}'),
          if (!state.revealed && state.myReview != null)
            const Padding(
              padding: EdgeInsets.only(top: KSpacing.sm),
              child: KLocalizedText(
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
                label: const KLocalizedText('রিভিউ দিন'),
              ),
            ),
          ],
        ],
      ),
    ),
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
      appBar: AppBar(title: const KLocalizedText('আমার পাওয়া রিভিউ')),
      body: reviews.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => RetryPanel(
          error: error,
          label: 'রিভিউ লোড করা যায়নি।',
          onRetry: () => ref.invalidate(receivedReviewsProvider),
        ),
        data: (items) => items.isEmpty
            ? const Center(
                child: KLocalizedText('এখনো প্রকাশিত কোনো রিভিউ নেই।'),
              )
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
                          : const KLocalizedText('কোনো মন্তব্য দেওয়া হয়নি।'),
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
      appBar: AppBar(title: const KLocalizedText('পছন্দের কর্মী')),
      body: favorites.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => RetryPanel(
          error: error,
          label: 'পছন্দের তালিকা লোড করা যায়নি।',
          onRetry: () => ref.invalidate(favoriteWorkersProvider),
        ),
        data: (items) => items.isEmpty
            ? const Center(
                child: KLocalizedText('এখনো কোনো কর্মী পছন্দে রাখা হয়নি।'),
              )
            : ListView.builder(
                padding: const EdgeInsets.all(KSpacing.md),
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final worker = items[index];
                  return Card(
                    child: ListTile(
                      leading: const CircleAvatar(child: Icon(Icons.person)),
                      title: Text(worker.displayName),
                      subtitle: KLocalizedText('★ ${worker.ratingAverage}'),
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
        title: const KLocalizedText('কাজের দিন'),
        subtitle: KLocalizedText('${date.day}/${date.month}/${date.year}'),
        onTap: onDate,
      ),
      Row(
        children: [
          Expanded(
            child: ListTile(
              title: const KLocalizedText('শুরু'),
              subtitle: KLocalizedText(start.format(context)),
              onTap: onStart,
            ),
          ),
          Expanded(
            child: ListTile(
              title: const KLocalizedText('শেষ'),
              subtitle: KLocalizedText(end.format(context)),
              onTap: onEnd,
            ),
          ),
        ],
      ),
    ],
  );
}

double _workerGridCardHeight(BuildContext context) {
  final scale = (MediaQuery.textScalerOf(context).scale(16) / 16).clamp(1, 2);
  final accessible = opportunityGridColumns(context) == 1;
  // Room for Bangla line height, which is taller than English.
  return 320 + ((scale - 1) * (accessible ? 200 : 96));
}

Future<int?> _askAmount(BuildContext context) =>
    showDialog<int>(context: context, builder: (_) => const _AmountDialog());

/// Owns its text controller, so the field is not disposed while the dialog
/// is still animating out.
class _AmountDialog extends StatefulWidget {
  const _AmountDialog();

  @override
  State<_AmountDialog> createState() => _AmountDialogState();
}

class _AmountDialogState extends State<_AmountDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const KLocalizedText('প্রস্তাবিত পারিশ্রমিক'),
    content: KTextField(
      label: 'টাকা',
      controller: _controller,
      keyboardType: TextInputType.number,
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const KLocalizedText('ফিরুন'),
      ),
      FilledButton(
        onPressed: () {
          final value = int.tryParse(_controller.text);
          if (value != null && value > 0) Navigator.pop(context, value);
        },
        child: const KLocalizedText('অনুরোধ পাঠান'),
      ),
    ],
  );
}

DateTime _combine(DateTime date, TimeOfDay time) =>
    DateTime(date.year, date.month, date.day, time.hour, time.minute);

/// Bangla source label for a job, application or assignment status.
String jobStatusLabel(String status) => _statusBn(status);

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
  'PAYMENT_RECORDED' => 'নগদ পেমেন্ট রেকর্ড হয়েছে',
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

/// The poster's area from the server profile, or null when none is set or
/// the profile cannot be loaded.
Future<String?> _serverAreaId(WidgetRef ref) async {
  try {
    final me = await ref.read(meProvider.future);
    return me.areaId;
  } on Object {
    return null;
  }
}

/// Explains that an area is needed and offers the screen that sets it.
void showMissingAreaMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: KLocalizedText(message),
        action: SnackBarAction(
          label: KaajLocalizations.text(context, 'প্রোফাইল সম্পাদনা'),
          onPressed: () => context.push(AppRoutes.editProfile),
        ),
      ),
    );
}

/// Publishes a saved draft and refreshes the poster's lists. Shows why it
/// failed and returns false when it could not be published.
Future<bool> publishDraftJob(
  BuildContext context,
  WidgetRef ref,
  String jobId,
) async {
  try {
    await ref.read(jobsRepositoryProvider).publishJob(jobId);
    ref
      ..invalidate(myJobsProvider)
      ..invalidate(jobFeedProvider);
    return true;
  } on Object catch (error) {
    if (context.mounted) {
      showFailureSnack(
        context,
        error,
        'খসড়াটি প্রকাশ করা যায়নি। আবার চেষ্টা করুন।',
      );
    }
    return false;
  }
}

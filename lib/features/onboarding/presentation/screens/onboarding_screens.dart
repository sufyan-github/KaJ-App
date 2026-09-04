import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../../core/widgets/k_primary_button.dart';
import '../../../catalog/domain/entities/catalog_skill.dart';
import '../../../catalog/domain/entities/service_location.dart';
import '../../../catalog/presentation/controllers/catalog_providers.dart';
import '../../../jobs/presentation/controllers/jobs_providers.dart';
import '../../domain/availability_schedule.dart';
import '../../domain/onboarding_state.dart';
import '../controllers/onboarding_controller.dart';

class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(
      text: ref.read(onboardingControllerProvider).displayName,
    );
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(onboardingControllerProvider.notifier)
          .saveProfile(_name.text);
      if (mounted) context.go(AppRoutes.onboardingRole);
    } catch (_) {
      if (mounted) _showError(context);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => _OnboardingScaffold(
    step: 1,
    title: 'আপনার পরিচয় তৈরি করুন',
    subtitle: 'কাজের মানুষ ও গ্রাহকেরা এই নামটি দেখতে পাবেন।',
    child: Form(
      key: _formKey,
      child: Column(
        children: [
          TextFormField(
            controller: _name,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              labelText: KaajLocalizations.text(context, 'আপনার নাম'),
            ),
            validator: (value) => (value?.trim().length ?? 0) < 2
                ? 'কমপক্ষে ২ অক্ষরের নাম লিখুন'
                : null,
            onFieldSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: KSpacing.lg),
          KPrimaryButton(
            label: 'এগিয়ে যান',
            isLoading: _saving,
            onPressed: _submit,
          ),
        ],
      ),
    ),
  );
}

class RoleSelectionScreen extends ConsumerWidget {
  const RoleSelectionScreen({super.key});

  Future<void> _select(
    BuildContext context,
    WidgetRef ref,
    KaajRole role,
  ) async {
    try {
      await ref.read(onboardingControllerProvider.notifier).selectRole(role);
      if (context.mounted) context.go(AppRoutes.onboardingLocation);
    } catch (_) {
      if (context.mounted) _showError(context);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) => _OnboardingScaffold(
    step: 2,
    title: 'আপনি কী করতে চান?',
    subtitle: 'একই অ্যাকাউন্টে পরে দুই ভূমিকাই ব্যবহার করা যাবে।',
    child: Column(
      children: [
        _ChoiceCard(
          icon: Icons.search,
          title: 'কাজের লোক খুঁজব',
          body: 'কাজ পোস্ট করে কাছের দক্ষ মানুষ খুঁজুন।',
          onTap: () => _select(context, ref, KaajRole.customer),
        ),
        const SizedBox(height: KSpacing.md),
        _ChoiceCard(
          icon: Icons.handyman_outlined,
          title: 'কাজ খুঁজব',
          body: 'নিজের দক্ষতা ও সময় অনুযায়ী কাজ পান।',
          onTap: () => _select(context, ref, KaajRole.worker),
        ),
      ],
    ),
  );
}

class LocationSelectionScreen extends ConsumerStatefulWidget {
  const LocationSelectionScreen({super.key});

  @override
  ConsumerState<LocationSelectionScreen> createState() =>
      _LocationSelectionScreenState();
}

class _LocationSelectionScreenState
    extends ConsumerState<LocationSelectionScreen> {
  String _query = '';
  String? _selected;
  bool _saving = false;

  Future<void> _submit() async {
    if (_selected == null) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(onboardingControllerProvider.notifier)
          .selectLocation(_selected!);
      if (!mounted) return;
      final role = ref.read(onboardingControllerProvider).role;
      context.go(
        role == KaajRole.worker
            ? AppRoutes.onboardingSkills
            : AppRoutes.onboardingTour,
      );
    } catch (_) {
      if (mounted) _showError(context);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locations = ref.watch(_rootLocationsProvider);
    return _OnboardingScaffold(
      step: 3,
      title: 'আপনার এলাকা বেছে নিন',
      subtitle: 'এতে কাছাকাছি কাজ ও মানুষ দেখাতে পারব।',
      child: Column(
        children: [
          TextField(
            decoration: InputDecoration(
              labelText: KaajLocalizations.text(context, 'এলাকা খুঁজুন'),
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (value) => setState(() => _query = value.trim()),
          ),
          const SizedBox(height: KSpacing.sm),
          OutlinedButton.icon(
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              builder: (context) => const Padding(
                padding: EdgeInsets.all(KSpacing.lg),
                child: KLocalizedText(
                  'আপনার অনুমতি পেলে শুধু কাছের কাজ দেখাতে বর্তমান অবস্থান ব্যবহার করব। সঠিক ঠিকানা প্রকাশ করা হবে না।',
                ),
              ),
            ),
            icon: const Icon(Icons.my_location),
            label: const KLocalizedText('আমার বর্তমান অবস্থান ব্যবহার করুন'),
          ),
          const SizedBox(height: KSpacing.md),
          locations.when(
            loading: () => const CircularProgressIndicator(),
            error: (_, _) =>
                const KLocalizedText('এলাকার তালিকা লোড করা যায়নি।'),
            data: (items) {
              final filtered = items
                  .where(
                    (item) =>
                        item.nameBn.contains(_query) ||
                        item.nameEn.toLowerCase().contains(
                          _query.toLowerCase(),
                        ),
                  )
                  .toList(growable: false);
              return RadioGroup<String>(
                groupValue: _selected,
                onChanged: (value) => setState(() => _selected = value),
                child: Column(
                  children: filtered
                      .map(
                        (item) => RadioListTile<String>(
                          value: item.id,
                          title: KLocalizedText(
                            item.nameFor(
                              Localizations.localeOf(context).languageCode,
                            ),
                          ),
                        ),
                      )
                      .toList(growable: false),
                ),
              );
            },
          ),
          const SizedBox(height: KSpacing.md),
          KPrimaryButton(
            label: 'এলাকা নিশ্চিত করুন',
            isLoading: _saving,
            onPressed: _selected == null ? null : _submit,
          ),
        ],
      ),
    );
  }
}

final _rootLocationsProvider = FutureProvider<List<ServiceLocation>>((ref) {
  return ref.watch(catalogRepositoryProvider).getLocations();
});

class WorkerSkillsScreen extends ConsumerStatefulWidget {
  const WorkerSkillsScreen({this.isEditing = false, super.key});

  final bool isEditing;

  @override
  ConsumerState<WorkerSkillsScreen> createState() => _WorkerSkillsScreenState();
}

class _WorkerSkillsScreenState extends ConsumerState<WorkerSkillsScreen> {
  final _rate = TextEditingController();
  final Set<String> _selected = {};
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _selected.addAll(ref.read(onboardingControllerProvider).skillIds);
  }

  @override
  void dispose() {
    _rate.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _saving = true);
    try {
      final taka = int.tryParse(_rate.text.trim());
      await ref
          .read(onboardingControllerProvider.notifier)
          .saveWorkerSetup(
            _selected.toList(growable: false),
            hourlyRatePoisha: taka == null ? null : taka * 100,
          );
      if (mounted) {
        context.go(
          widget.isEditing ? AppRoutes.home : AppRoutes.onboardingAvailability,
        );
      }
    } catch (_) {
      if (mounted) _showError(context);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final skills = ref.watch(_skillsProvider);
    return _OnboardingScaffold(
      step: 4,
      title: 'আপনার দক্ষতা যোগ করুন (ঐচ্ছিক)',
      subtitle:
          'চাইলে সর্বোচ্চ ৮টি দক্ষতা বেছে নিন। দক্ষতা ও পারিশ্রমিক পরে যোগ বা পরিবর্তন করা যাবে।',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          skills.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, _) =>
                const KLocalizedText('দক্ষতার তালিকা লোড করা যায়নি।'),
            data: (items) => Wrap(
              spacing: KSpacing.sm,
              runSpacing: KSpacing.sm,
              children: items.map(_skillChip).toList(growable: false),
            ),
          ),
          if (_selected.length >= 8) ...[
            const SizedBox(height: KSpacing.sm),
            const KLocalizedText('আপনি সর্বোচ্চ ৮টি দক্ষতা বেছে নিয়েছেন।'),
          ],
          const SizedBox(height: KSpacing.lg),
          TextField(
            controller: _rate,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: KaajLocalizations.text(
                context,
                'ঘণ্টাপ্রতি পারিশ্রমিক (টাকা, ঐচ্ছিক)',
              ),
            ),
          ),
          const SizedBox(height: KSpacing.lg),
          KPrimaryButton(
            label: _selected.isEmpty ? 'এখন বাদ দিন' : 'দক্ষতা সংরক্ষণ করুন',
            isLoading: _saving,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }

  Widget _skillChip(CatalogSkill skill) {
    final selected = _selected.contains(skill.id);
    return FilterChip(
      label: KLocalizedText(
        skill.nameFor(Localizations.localeOf(context).languageCode),
      ),
      selected: selected,
      onSelected: (value) {
        if (value && _selected.length >= 8) return;
        setState(
          () => value ? _selected.add(skill.id) : _selected.remove(skill.id),
        );
      },
    );
  }
}

final _skillsProvider = FutureProvider<List<CatalogSkill>>((ref) {
  return ref.watch(catalogRepositoryProvider).getSkills();
});

class AvailabilitySetupScreen extends ConsumerStatefulWidget {
  const AvailabilitySetupScreen({this.isEditing = false, super.key});

  final bool isEditing;

  @override
  ConsumerState<AvailabilitySetupScreen> createState() =>
      _AvailabilitySetupScreenState();
}

class _AvailabilitySetupScreenState
    extends ConsumerState<AvailabilitySetupScreen> {
  final Set<int> _days = {};
  final List<AvailabilityRule> _rules = [];
  late TimeOfDay _startTime;
  late TimeOfDay _endTime;
  bool _editorDirty = false;
  bool _loading = false;
  bool _loadFailed = false;
  bool _saving = false;
  static const _names = [
    'রবি',
    'সোম',
    'মঙ্গল',
    'বুধ',
    'বৃহস্পতি',
    'শুক্র',
    'শনি',
  ];

  @override
  void initState() {
    super.initState();
    final saved = ref.read(onboardingControllerProvider).availableDays;
    final state = ref.read(onboardingControllerProvider);
    _days.addAll(saved.isEmpty ? {5, 6} : saved);
    _startTime = _parseTime(state.availableStartTime);
    _endTime = _parseTime(state.availableEndTime);
    _rules.addAll(
      _days.map(
        (day) => AvailabilityRule(
          dayOfWeek: day,
          startTime: _apiTime(_startTime),
          endTime: _apiTime(_endTime),
        ),
      ),
    );
    if (widget.isEditing) {
      _loading = true;
      Future<void>.microtask(_loadSavedAvailability);
    }
  }

  Future<void> _loadSavedAvailability() async {
    try {
      final schedule = await ref
          .read(onboardingRepositoryProvider)
          .getAvailability();
      if (!mounted) return;
      setState(() {
        _rules
          ..clear()
          ..addAll(schedule.rules);
        _days
          ..clear()
          ..addAll(schedule.rules.map((rule) => rule.dayOfWeek));
        if (schedule.rules.isNotEmpty) {
          _startTime = _parseTime(schedule.rules.first.startTime);
          _endTime = _parseTime(schedule.rules.first.endTime);
        }
        _loading = false;
        _loadFailed = false;
        _editorDirty = false;
      });
    } on Object {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadFailed = true;
      });
    }
  }

  Future<void> _submit() async {
    if (_editorDirty) _replaceSelectedRules();
    if (_rules.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(onboardingControllerProvider.notifier)
          .saveAvailabilityRules(_rules);
      ref.invalidate(jobFeedProvider);
      if (mounted) {
        if (widget.isEditing) {
          context.pop();
        } else {
          context.go(AppRoutes.onboardingTour);
        }
      }
    } catch (_) {
      if (mounted) _showError(context);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => _OnboardingScaffold(
    step: 5,
    standaloneTitle: widget.isEditing ? 'ডিফল্ট কাজের সময়' : null,
    title: widget.isEditing ? 'ডিফল্ট কাজের সময়' : 'কখন কাজ করতে পারবেন?',
    subtitle: widget.isEditing
        ? 'এটি আপনার অ্যাকাউন্টের সাধারণ সময়। পোস্ট করা প্রতিটি কাজের তারিখ ও সময় আলাদা থাকবে।'
        : 'দিন ও সময় বেছে দিন। এই সময়গুলো গ্রাহকেরা বুকিংয়ের আগে দেখতে পারবেন।',
    child: _loading
        ? const Padding(
            padding: EdgeInsets.all(KSpacing.xl),
            child: Center(child: CircularProgressIndicator()),
          )
        : _loadFailed
        ? Center(
            child: Column(
              children: [
                const KLocalizedText('সংরক্ষিত সময় লোড করা যায়নি।'),
                const SizedBox(height: KSpacing.md),
                FilledButton(
                  onPressed: () {
                    setState(() {
                      _loading = true;
                      _loadFailed = false;
                    });
                    _loadSavedAvailability();
                  },
                  child: const KLocalizedText('আবার চেষ্টা করুন'),
                ),
              ],
            ),
          )
        : Column(
            children: [
              if (_rules.isNotEmpty) ...[
                Align(
                  alignment: Alignment.centerLeft,
                  child: KLocalizedText(
                    'বর্তমানে সংরক্ষিত',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                const SizedBox(height: KSpacing.sm),
                ..._rules.asMap().entries.map(
                  (entry) => Card(
                    margin: const EdgeInsets.only(bottom: KSpacing.xs),
                    child: ListTile(
                      dense: true,
                      leading: const Icon(Icons.schedule_outlined),
                      title: Text(
                        '${KaajLocalizations.text(context, _names[entry.value.dayOfWeek])} · ${_displayApiTime(context, entry.value.startTime)} – ${_displayApiTime(context, entry.value.endTime)}',
                      ),
                      trailing: IconButton(
                        tooltip: KaajLocalizations.text(
                          context,
                          'এই সময় মুছুন',
                        ),
                        onPressed: () => setState(() {
                          _rules.removeAt(entry.key);
                          _days
                            ..clear()
                            ..addAll(_rules.map((rule) => rule.dayOfWeek));
                        }),
                        icon: const Icon(Icons.delete_outline),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: KSpacing.md),
              ],
              Align(
                alignment: Alignment.centerLeft,
                child: KLocalizedText(
                  'দিন ও সময় যোগ/বদল করুন',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              const SizedBox(height: KSpacing.sm),
              Wrap(
                spacing: KSpacing.sm,
                children: List.generate(
                  7,
                  (day) => FilterChip(
                    label: KLocalizedText(_names[day]),
                    selected: _days.contains(day),
                    onSelected: (value) => setState(() {
                      value ? _days.add(day) : _days.remove(day);
                      _editorDirty = true;
                    }),
                  ),
                ),
              ),
              const SizedBox(height: KSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: _TimePickerCard(
                      label: 'শুরুর সময়',
                      value: _startTime,
                      onTap: () => _pickTime(isStart: true),
                    ),
                  ),
                  const SizedBox(width: KSpacing.sm),
                  Expanded(
                    child: _TimePickerCard(
                      label: 'শেষের সময়',
                      value: _endTime,
                      onTap: () => _pickTime(isStart: false),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: KSpacing.sm),
              Wrap(
                spacing: KSpacing.sm,
                children: [
                  ActionChip(
                    label: const KLocalizedText('সকাল ৮টা–১২টা'),
                    onPressed: () => _setTimeRange(8, 12),
                  ),
                  ActionChip(
                    label: const KLocalizedText('দুপুর ১২টা–৫টা'),
                    onPressed: () => _setTimeRange(12, 17),
                  ),
                  ActionChip(
                    label: const KLocalizedText('সন্ধ্যা ৬টা–১০টা'),
                    onPressed: () => _setTimeRange(18, 22),
                  ),
                ],
              ),
              const SizedBox(height: KSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(() {
                        _days
                          ..clear()
                          ..addAll({0, 1, 2, 3, 4});
                        _editorDirty = true;
                      }),
                      child: const KLocalizedText('রবি–বৃহস্পতি'),
                    ),
                  ),
                  const SizedBox(width: KSpacing.sm),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(() {
                        _days
                          ..clear()
                          ..addAll({5, 6});
                        _editorDirty = true;
                      }),
                      child: const KLocalizedText('সাপ্তাহিক ছুটি'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: KSpacing.md),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed:
                      _days.isEmpty ||
                          _minutes(_endTime) <= _minutes(_startTime)
                      ? null
                      : _replaceSelectedRules,
                  icon: const Icon(Icons.playlist_add),
                  label: const KLocalizedText(
                    'নির্বাচিত দিনের সময় যোগ/বদল করুন',
                  ),
                ),
              ),
              const SizedBox(height: KSpacing.lg),
              if (_minutes(_endTime) <= _minutes(_startTime)) ...[
                const KLocalizedText(
                  'শেষের সময় শুরুর সময়ের পরে হতে হবে।',
                  style: TextStyle(color: KColors.danger),
                ),
                const SizedBox(height: KSpacing.sm),
              ],
              KPrimaryButton(
                label: 'সব সময় সংরক্ষণ করুন',
                isLoading: _saving,
                onPressed: _rules.isEmpty && !_editorDirty ? null : _submit,
              ),
            ],
          ),
  );

  Future<void> _pickTime({required bool isStart}) async {
    final selected = await showTimePicker(
      context: context,
      initialTime: isStart ? _startTime : _endTime,
    );
    if (selected == null || !mounted) return;
    setState(() {
      if (isStart) {
        _startTime = selected;
      } else {
        _endTime = selected;
      }
      _editorDirty = true;
    });
  }

  void _setTimeRange(int startHour, int endHour) => setState(() {
    _startTime = TimeOfDay(hour: startHour, minute: 0);
    _endTime = TimeOfDay(hour: endHour, minute: 0);
    _editorDirty = true;
  });

  void _replaceSelectedRules() {
    final selected = Set<int>.from(_days);
    final startTime = _apiTime(_startTime);
    final endTime = _apiTime(_endTime);
    setState(() {
      _rules.removeWhere((rule) => selected.contains(rule.dayOfWeek));
      _rules.addAll(
        selected.map(
          (day) => AvailabilityRule(
            dayOfWeek: day,
            startTime: startTime,
            endTime: endTime,
          ),
        ),
      );
      _rules.sort((left, right) => left.dayOfWeek.compareTo(right.dayOfWeek));
      _editorDirty = false;
    });
  }

  static String _displayApiTime(BuildContext context, String value) =>
      _parseTime(value).format(context);

  static TimeOfDay _parseTime(String value) {
    final parts = value.split(':');
    return TimeOfDay(
      hour: int.tryParse(parts.first) ?? 18,
      minute: parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0,
    );
  }

  static String _apiTime(TimeOfDay value) =>
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';

  static int _minutes(TimeOfDay value) => value.hour * 60 + value.minute;
}

class _TimePickerCard extends StatelessWidget {
  const _TimePickerCard({
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;
  final TimeOfDay value;

  @override
  Widget build(BuildContext context) => OutlinedButton(
    onPressed: onTap,
    style: OutlinedButton.styleFrom(
      padding: const EdgeInsets.all(KSpacing.md),
      alignment: Alignment.centerLeft,
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        KLocalizedText(
          label,
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: KColors.textSecondary),
        ),
        const SizedBox(height: KSpacing.xs),
        Row(
          children: [
            const Icon(Icons.schedule_outlined),
            const SizedBox(width: KSpacing.sm),
            KLocalizedText(
              MaterialLocalizations.of(context).formatTimeOfDay(value),
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ],
        ),
      ],
    ),
  );
}

class OnboardingTourScreen extends ConsumerStatefulWidget {
  const OnboardingTourScreen({super.key});

  @override
  ConsumerState<OnboardingTourScreen> createState() =>
      _OnboardingTourScreenState();
}

class _OnboardingTourScreenState extends ConsumerState<OnboardingTourScreen> {
  final _page = PageController();
  int _index = 0;

  Future<void> _finish() async {
    await ref.read(onboardingControllerProvider.notifier).finish();
    if (mounted) context.go(AppRoutes.home);
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const cards = [
      (
        Icons.manage_search,
        'কাছের কাজ খুঁজুন',
        'দক্ষতা, এলাকা ও সময় অনুযায়ী কাজ দেখুন।',
      ),
      (
        Icons.verified_user_outlined,
        'বিশ্বাসের তথ্য দেখুন',
        'ফোন যাচাই ও কাজের ইতিহাস দেখে সিদ্ধান্ত নিন।',
      ),
      (
        Icons.rate_review_outlined,
        'কাজ শেষে মতামত দিন',
        'দুই পক্ষের সৎ মতামত নিরাপদ কমিউনিটি গড়ে।',
      ),
    ];
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: _finish,
                child: const KLocalizedText('এড়িয়ে যান'),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _page,
                itemCount: cards.length,
                onPageChanged: (value) => setState(() => _index = value),
                itemBuilder: (context, index) => Padding(
                  padding: const EdgeInsets.all(KSpacing.xl),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(cards[index].$1, size: 88, color: KColors.primary),
                      const SizedBox(height: KSpacing.lg),
                      KLocalizedText(
                        cards[index].$2,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: KSpacing.sm),
                      KLocalizedText(
                        cards[index].$3,
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(KSpacing.lg),
              child: KPrimaryButton(
                label: _index == cards.length - 1 ? 'শুরু করুন' : 'পরবর্তী',
                onPressed: _index == cards.length - 1
                    ? _finish
                    : () => _page.nextPage(
                        duration: const Duration(milliseconds: 250),
                        curve: Curves.easeOut,
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OnboardingScaffold extends StatelessWidget {
  const _OnboardingScaffold({
    required this.step,
    required this.title,
    required this.subtitle,
    required this.child,
    this.standaloneTitle,
  });

  final Widget child;
  final int step;
  final String subtitle;
  final String? standaloneTitle;
  final String title;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: KLocalizedText(standaloneTitle ?? 'ধাপ $step / ৫')),
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(KSpacing.lg),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (standaloneTitle == null) ...[
                  LinearProgressIndicator(value: step / 5),
                  const SizedBox(height: KSpacing.lg),
                ],
                KLocalizedText(
                  title,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: KSpacing.sm),
                KLocalizedText(subtitle),
                const SizedBox(height: KSpacing.lg),
                child,
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class _ChoiceCard extends StatelessWidget {
  const _ChoiceCard({
    required this.icon,
    required this.title,
    required this.body,
    required this.onTap,
  });
  final String body;
  final IconData icon;
  final VoidCallback onTap;
  final String title;

  @override
  Widget build(BuildContext context) => Card(
    child: InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.lg),
        child: Row(
          children: [
            Icon(icon, size: 40, color: KColors.primary),
            const SizedBox(width: KSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  KLocalizedText(
                    title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  KLocalizedText(body),
                ],
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    ),
  );
}

void _showError(BuildContext context) {
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(
      content: KLocalizedText('সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।'),
    ),
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_primary_button.dart';
import '../../../catalog/domain/entities/catalog_skill.dart';
import '../../../catalog/domain/entities/service_location.dart';
import '../../../catalog/presentation/controllers/catalog_providers.dart';
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
            decoration: const InputDecoration(labelText: 'আপনার নাম'),
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
            decoration: const InputDecoration(
              labelText: 'এলাকা খুঁজুন',
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
                child: Text(
                  'আপনার অনুমতি পেলে শুধু কাছের কাজ দেখাতে বর্তমান অবস্থান ব্যবহার করব। সঠিক ঠিকানা প্রকাশ করা হবে না।',
                ),
              ),
            ),
            icon: const Icon(Icons.my_location),
            label: const Text('আমার বর্তমান অবস্থান ব্যবহার করুন'),
          ),
          const SizedBox(height: KSpacing.md),
          locations.when(
            loading: () => const CircularProgressIndicator(),
            error: (_, _) => const Text('এলাকার তালিকা লোড করা যায়নি।'),
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
                          title: Text(item.nameBn),
                          subtitle: Text(item.nameEn),
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
    if (_selected.isEmpty) return;
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
      title: 'আপনার দক্ষতা যোগ করুন',
      subtitle: 'সর্বোচ্চ ৮টি দক্ষতা বেছে নিন। পারিশ্রমিক এখন না দিলেও হবে।',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          skills.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, _) => const Text('দক্ষতার তালিকা লোড করা যায়নি।'),
            data: (items) => Wrap(
              spacing: KSpacing.sm,
              runSpacing: KSpacing.sm,
              children: items.map(_skillChip).toList(growable: false),
            ),
          ),
          if (_selected.length >= 8) ...[
            const SizedBox(height: KSpacing.sm),
            const Text('আপনি সর্বোচ্চ ৮টি দক্ষতা বেছে নিয়েছেন।'),
          ],
          const SizedBox(height: KSpacing.lg),
          TextField(
            controller: _rate,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'ঘণ্টাপ্রতি পারিশ্রমিক (টাকা, ঐচ্ছিক)',
            ),
          ),
          const SizedBox(height: KSpacing.lg),
          KPrimaryButton(
            label: 'দক্ষতা সংরক্ষণ করুন',
            isLoading: _saving,
            onPressed: _selected.isEmpty ? null : _submit,
          ),
        ],
      ),
    );
  }

  Widget _skillChip(CatalogSkill skill) {
    final selected = _selected.contains(skill.id);
    return FilterChip(
      label: Text(skill.nameBn),
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
  late final Set<int> _days;
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
    _days = saved.isEmpty ? {5, 6} : saved.toSet();
  }

  Future<void> _submit() async {
    setState(() => _saving = true);
    try {
      await ref
          .read(onboardingControllerProvider.notifier)
          .saveAvailability(_days.toList()..sort());
      if (mounted) {
        context.go(
          widget.isEditing ? AppRoutes.home : AppRoutes.onboardingTour,
        );
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
    title: 'কখন কাজ করতে পারবেন?',
    subtitle:
        'নির্বাচিত দিনে সন্ধ্যা ৬টা–রাত ১০টা ধরা হবে। পরে বিস্তারিত বদলাতে পারবেন।',
    child: Column(
      children: [
        Wrap(
          spacing: KSpacing.sm,
          children: List.generate(
            7,
            (day) => FilterChip(
              label: Text(_names[day]),
              selected: _days.contains(day),
              onSelected: (value) =>
                  setState(() => value ? _days.add(day) : _days.remove(day)),
            ),
          ),
        ),
        const SizedBox(height: KSpacing.md),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => setState(
                  () => _days
                    ..clear()
                    ..addAll({0, 1, 2, 3, 4}),
                ),
                child: const Text('সপ্তাহের সন্ধ্যা'),
              ),
            ),
            const SizedBox(width: KSpacing.sm),
            Expanded(
              child: OutlinedButton(
                onPressed: () => setState(
                  () => _days
                    ..clear()
                    ..addAll({5, 6}),
                ),
                child: const Text('সাপ্তাহিক ছুটি'),
              ),
            ),
          ],
        ),
        const SizedBox(height: KSpacing.lg),
        KPrimaryButton(
          label: 'সময় সংরক্ষণ করুন',
          isLoading: _saving,
          onPressed: _days.isEmpty ? null : _submit,
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
                child: const Text('এড়িয়ে যান'),
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
                      Text(
                        cards[index].$2,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: KSpacing.sm),
                      Text(cards[index].$3, textAlign: TextAlign.center),
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
  });

  final Widget child;
  final int step;
  final String subtitle;
  final String title;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('ধাপ $step / ৫')),
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(KSpacing.lg),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                LinearProgressIndicator(value: step / 5),
                const SizedBox(height: KSpacing.lg),
                Text(title, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: KSpacing.sm),
                Text(subtitle),
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
                  Text(title, style: Theme.of(context).textTheme.titleMedium),
                  Text(body),
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
    const SnackBar(content: Text('সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।')),
  );
}

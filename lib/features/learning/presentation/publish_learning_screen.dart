import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/formatting/latin_digits_formatter.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../../core/widgets/k_text_field.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../../catalog/domain/entities/catalog_category.dart';
import '../../catalog/domain/entities/service_location.dart';
import '../../catalog/presentation/controllers/catalog_providers.dart';
import '../../catalog/presentation/widgets/area_picker.dart';
import '../domain/learning_models.dart';
import 'learning_providers.dart';
import 'learning_widgets.dart';

/// An approved mentor publishes a training or an apprenticeship with clear
/// terms: what the learner pays or receives, when, where and how many.
class PublishLearningScreen extends ConsumerStatefulWidget {
  const PublishLearningScreen({super.key});

  @override
  ConsumerState<PublishLearningScreen> createState() =>
      _PublishLearningScreenState();
}

class _PublishLearningScreenState extends ConsumerState<PublishLearningScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _amount = TextEditingController();
  final _seats = TextEditingController(text: '5');
  LearningKind _kind = LearningKind.training;
  ParticipantTerms _terms = ParticipantTerms.free;
  DeliveryMode _mode = DeliveryMode.onSite;
  bool _flexible = false;
  String? _categoryId;
  final _skillIds = <String>{};
  ServiceLocation? _area;
  late DateTime _startsAt = _nextMorning(1);
  late DateTime _endsAt = _nextMorning(8);
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Publishing needs MENTOR in the access token, which a token issued
    // before the approval lacks. A fresh token carries the current roles.
    ref.read(sessionTokenStoreProvider).refreshAccessToken().ignore();
  }

  static DateTime _nextMorning(int days) {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day + days, 10);
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _amount.dispose();
    _seats.dispose();
    super.dispose();
  }

  bool get _needsAmount =>
      _terms == ParticipantTerms.paidByParticipant ||
      _terms == ParticipantTerms.stipend;

  Future<void> _pick(bool start) async {
    final current = start ? _startsAt : _endsAt;
    final date = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 366)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(current),
    );
    if (time == null) return;
    final value = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
    setState(() => start ? _startsAt = value : _endsAt = value);
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    String? problem;
    if (_categoryId == null) {
      problem = 'কোন ধরনের কাজ শেখাবেন, তা বেছে নিন।';
    } else if (_skillIds.isEmpty) {
      problem = 'অন্তত একটি দক্ষতা বেছে নিন।';
    } else if (_area == null) {
      problem = 'কোথায় শেখাবেন, সেই এলাকা বেছে নিন।';
    } else if (!_endsAt.isAfter(_startsAt)) {
      problem = 'শেষের সময় শুরুর পরে হতে হবে।';
    }
    if (problem != null) {
      setState(() => _error = KaajLocalizations.text(context, problem!));
      return;
    }
    final amount = int.tryParse(latinDigits(_amount.text.trim()));
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final published = await ref
          .read(learningRepositoryProvider)
          .createAndPublish(
            LearningDraft(
              kind: _kind,
              title: _title.text,
              description: _description.text,
              categoryId: _categoryId!,
              skillIds: _skillIds.toList(growable: false),
              locationId: _area!.id,
              terms: _terms,
              feeTaka: _terms == ParticipantTerms.paidByParticipant
                  ? amount
                  : null,
              stipendTaka: _terms == ParticipantTerms.stipend ? amount : null,
              seats: int.parse(latinDigits(_seats.text.trim())),
              startsAt: _startsAt,
              endsAt: _endsAt,
              deliveryMode: _mode,
              flexibleHours: _flexible,
            ),
          );
      ref.invalidate(myLearningOpportunitiesProvider);
      if (mounted) {
        context.pushReplacement(AppRoutes.learningOpportunity(published.id));
      }
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _error = failureText(
          context,
          error,
          'শেখার সুযোগ প্রকাশ করা যায়নি। আবার চেষ্টা করুন।',
        );
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final categories = ref.watch(categoryTreeProvider).valueOrNull ?? const [];
    final skills = ref.watch(catalogSkillsProvider).valueOrNull ?? const [];
    final category = categories
        .where((item) => item.id == _categoryId)
        .firstOrNull;
    final categoryIds = <String>{
      if (category != null) ...[
        category.id,
        for (final child in category.children) child.id,
      ],
    };
    final categorySkills = skills
        .where((skill) => categoryIds.contains(skill.categoryId))
        .toList(growable: false);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('শেখার সুযোগ প্রকাশ করুন')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(KSpacing.md),
          children: [
            SegmentedButton<LearningKind>(
              segments: [
                for (final kind in LearningKind.values)
                  ButtonSegment(
                    value: kind,
                    label: KLocalizedText(learningKindLabel(kind)),
                  ),
              ],
              selected: {_kind},
              onSelectionChanged: (value) =>
                  setState(() => _kind = value.first),
            ),
            const SizedBox(height: KSpacing.xs),
            KLocalizedText(
              _kind == LearningKind.training
                  ? 'নির্দিষ্ট সময়ে কয়েকটি সেশনে শেখানো।'
                  : 'আপনার সাথে কাজ করতে করতে শেখা। এটি চাকরি নয়।',
              style: const TextStyle(color: KColors.textSecondary),
            ),
            const SizedBox(height: KSpacing.md),
            KTextField(
              label: 'শিরোনাম',
              controller: _title,
              validator: (value) => (value?.trim().length ?? 0) < 3
                  ? 'কমপক্ষে ৩ অক্ষর লিখুন।'
                  : null,
            ),
            const SizedBox(height: KSpacing.sm),
            KTextField(
              label: 'কী শেখাবেন ও কীভাবে',
              controller: _description,
              maxLines: 5,
              minLines: 3,
              validator: (value) => (value?.trim().length ?? 0) < 10
                  ? 'কমপক্ষে ১০ অক্ষর লিখুন।'
                  : null,
            ),
            const SizedBox(height: KSpacing.md),
            DropdownButtonFormField<String>(
              key: const ValueKey('learning-category'),
              initialValue: _categoryId,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: KaajLocalizations.text(context, 'কাজের ধরন'),
              ),
              items: [
                for (final CatalogCategory item in categories)
                  DropdownMenuItem(
                    value: item.id,
                    child: Text(item.nameFor(language)),
                  ),
              ],
              onChanged: (value) => setState(() {
                _categoryId = value;
                _skillIds.clear();
              }),
            ),
            if (categorySkills.isNotEmpty) ...[
              const SizedBox(height: KSpacing.sm),
              Wrap(
                spacing: KSpacing.sm,
                runSpacing: KSpacing.xs,
                children: [
                  for (final skill in categorySkills)
                    FilterChip(
                      key: ValueKey('learning-skill-${skill.id}'),
                      label: Text(skill.nameFor(language)),
                      selected: _skillIds.contains(skill.id),
                      onSelected: (on) => setState(
                        () => on
                            ? _skillIds.add(skill.id)
                            : _skillIds.remove(skill.id),
                      ),
                    ),
                ],
              ),
            ],
            const SizedBox(height: KSpacing.md),
            KLocalizedText(
              'শর্ত',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            RadioGroup<ParticipantTerms>(
              groupValue: _terms,
              onChanged: (value) =>
                  setState(() => _terms = value ?? ParticipantTerms.free),
              child: Column(
                children: [
                  for (final terms in ParticipantTerms.values)
                    RadioListTile<ParticipantTerms>(
                      key: ValueKey('learning-terms-${terms.wire}'),
                      contentPadding: EdgeInsets.zero,
                      value: terms,
                      title: KLocalizedText(termsShortLabel(terms)),
                      subtitle: KLocalizedText(termsExplanation(terms)),
                    ),
                ],
              ),
            ),
            if (_needsAmount)
              KTextField(
                label: _terms == ParticipantTerms.stipend
                    ? 'শিক্ষার্থী মোট ভাতা পাবেন (টাকা)'
                    : 'শিক্ষার্থী মোট ফি দেবেন (টাকা)',
                controller: _amount,
                keyboardType: TextInputType.number,
                validator: (value) {
                  final amount = int.tryParse(latinDigits(value?.trim() ?? ''));
                  return amount == null || amount <= 0
                      ? 'সঠিক টাকার পরিমাণ লিখুন।'
                      : null;
                },
              ),
            const SizedBox(height: KSpacing.md),
            KLocalizedText(
              'কোথায় শেখাবেন',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            Wrap(
              spacing: KSpacing.sm,
              children: [
                for (final mode in DeliveryMode.values)
                  ChoiceChip(
                    label: KLocalizedText(deliveryModeLabel(mode)),
                    selected: _mode == mode,
                    onSelected: (_) => setState(() => _mode = mode),
                  ),
              ],
            ),
            Card(
              margin: const EdgeInsets.only(top: KSpacing.sm),
              child: ListTile(
                key: const ValueKey('learning-area'),
                leading: const Icon(Icons.location_on_outlined),
                title: const KLocalizedText('এলাকা'),
                subtitle: _area == null
                    ? const KLocalizedText('এখনো বেছে নেওয়া হয়নি')
                    : Text(_area!.nameFor(language)),
                trailing: const KLocalizedText('বদলান'),
                onTap: () async {
                  final place = await showAreaPickerSheet(
                    context,
                    selectedId: _area?.id,
                  );
                  if (place != null) setState(() => _area = place);
                },
              ),
            ),
            const SizedBox(height: KSpacing.md),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.play_arrow_outlined),
              title: const KLocalizedText('শুরু'),
              subtitle: Text(KFormat.dayAndTime(context, _startsAt)),
              onTap: () => _pick(true),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.flag_outlined),
              title: const KLocalizedText('শেষ'),
              subtitle: Text(KFormat.dayAndTime(context, _endsAt)),
              onTap: () => _pick(false),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const KLocalizedText('সময় মানিয়ে নেওয়া যায়'),
              value: _flexible,
              onChanged: (value) => setState(() => _flexible = value),
            ),
            KTextField(
              label: 'কতজন শিক্ষার্থী নেবেন',
              controller: _seats,
              keyboardType: TextInputType.number,
              validator: (value) {
                final seats = int.tryParse(latinDigits(value?.trim() ?? ''));
                return seats == null || seats < 1 || seats > 100
                    ? '১ থেকে ১০০ জনের মধ্যে লিখুন।'
                    : null;
              },
            ),
            const SizedBox(height: KSpacing.md),
            if (_error case final error?) ...[
              Semantics(
                liveRegion: true,
                child: Text(
                  error,
                  style: const TextStyle(color: KColors.danger),
                ),
              ),
              const SizedBox(height: KSpacing.sm),
            ],
            KPrimaryButton(
              label: 'প্রকাশ করুন',
              isLoading: _saving,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

/// The mentors own trainings and apprenticeships, drafts included.
class MyLearningOpportunities extends ConsumerWidget {
  const MyLearningOpportunities({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mine = ref.watch(myLearningOpportunitiesProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: KLocalizedText(
                'আমার শেখার সুযোগ',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            FilledButton.icon(
              key: const ValueKey('learning-new'),
              // The theme makes buttons full width; not inside a Row.
              style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
              onPressed: () => context.push(AppRoutes.publishLearning),
              icon: const Icon(Icons.add),
              label: const KLocalizedText('নতুন'),
            ),
          ],
        ),
        const SizedBox(height: KSpacing.sm),
        mine.when(
          loading: () => const LinearProgressIndicator(),
          error: (error, _) =>
              Text(failureText(context, error, 'শেখার সুযোগ লোড করা যায়নি।')),
          data: (items) => items.isEmpty
              ? const KLocalizedText(
                  'এখনো কিছু প্রকাশ করেননি। "নতুন" চেপে প্রথম প্রশিক্ষণ বা শিক্ষানবিশি দিন।',
                  style: TextStyle(color: KColors.textSecondary),
                )
              : Column(
                  children: [
                    for (final item in items)
                      LearningOpportunityCard(
                        opportunity: item,
                        trailing: item.status == 'DRAFT'
                            ? OutlinedButton(
                                onPressed: () async {
                                  try {
                                    await ref
                                        .read(learningRepositoryProvider)
                                        .publish(item.id);
                                    ref.invalidate(
                                      myLearningOpportunitiesProvider,
                                    );
                                  } on Object catch (error) {
                                    if (context.mounted) {
                                      showFailureSnack(
                                        context,
                                        error,
                                        'শেখার সুযোগ প্রকাশ করা যায়নি। আবার চেষ্টা করুন।',
                                      );
                                    }
                                  }
                                },
                                child: const KLocalizedText('প্রকাশ করুন'),
                              )
                            : item.applicationsCount == null
                            ? null
                            : Text(
                                '${KaajLocalizations.text(context, 'মোট আবেদন')}: '
                                '${KFormat.count(context, item.applicationsCount!)}',
                              ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

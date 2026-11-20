import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../../core/widgets/k_text_field.dart';
import '../../catalog/domain/entities/catalog_skill.dart';
import '../../catalog/presentation/controllers/catalog_providers.dart';
import '../domain/idea_models.dart';
import 'idea_providers.dart';
import 'idea_widgets.dart';

/// `/ideas/:id/roles/new` and `/ideas/:id/roles/:roleId/edit` (owner).
class IdeaRoleEditorScreen extends ConsumerWidget {
  const IdeaRoleEditorScreen({required this.ideaId, this.roleId, super.key});

  final String ideaId;
  final String? roleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = roleId;
    final idea = ref.watch(ideaDetailProvider(ideaId));
    return Scaffold(
      appBar: AppBar(
        title: KLocalizedText(id == null ? 'ভূমিকা যোগ করুন' : 'ভূমিকা বদলান'),
      ),
      body: idea.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => IdeaLoadError(
          error: error,
          onRetry: () => ref.invalidate(ideaDetailProvider(ideaId)),
        ),
        data: (idea) {
          final role = id == null ? null : idea.role(id);
          if (!idea.isOwner || (id != null && role == null)) {
            return const KEmptyState(
              icon: Icons.lock_outline,
              title: 'ভূমিকাটি পাওয়া যাচ্ছে না',
              message:
                  'এটি সরিয়ে ফেলা হয়েছে, অথবা আপনার এটি দেখার অনুমতি নেই।',
            );
          }
          return _RoleForm(ideaId: ideaId, original: role);
        },
      ),
    );
  }
}

class _RoleForm extends ConsumerStatefulWidget {
  const _RoleForm({required this.ideaId, this.original});

  final String ideaId;
  final IdeaRole? original;

  @override
  ConsumerState<_RoleForm> createState() => _RoleFormState();
}

class _RoleFormState extends ConsumerState<_RoleForm> {
  final _form = GlobalKey<FormState>();
  late String _roleType = widget.original?.roleType ?? IdeaRoleTypes.all.first;
  late final _title = TextEditingController(text: widget.original?.title);
  late final _description = TextEditingController(
    text: widget.original?.description,
  );
  late final List<IdeaNamed> _skills = [...?widget.original?.skills];
  late String _time =
      IdeaTimeCommitments.all.contains(widget.original?.timeCommitment)
      ? widget.original!.timeCommitment
      : IdeaTimeCommitments.all.first;
  late String? _arrangement = widget.original?.arrangement;
  late String _status = widget.original?.status ?? IdeaRoleStatuses.open;
  bool _saving = false;
  bool _deleting = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  void _done() {
    ref.invalidate(ideaDetailProvider(widget.ideaId));
    if (mounted) context.pop();
  }

  Future<void> _save() async {
    if (_saving || !(_form.currentState?.validate() ?? false)) return;
    final draft = IdeaRoleDraft(
      roleType: _roleType,
      title: _title.text,
      description: _description.text,
      skillIds: [for (final skill in _skills) skill.id],
      timeCommitment: _time,
      arrangement: _arrangement,
      status: widget.original == null ? null : _status,
    );
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repository = ref.read(ideaRepositoryProvider);
      final original = widget.original;
      if (original == null) {
        await repository.createRole(widget.ideaId, draft);
      } else {
        await repository.updateRole(widget.ideaId, original.id, draft);
      }
      _done();
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _error = failureText(
            context,
            error,
            'ভূমিকাটি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final original = widget.original;
    if (original == null || _deleting) return;
    final confirmed = await confirmIdeaAction(
      context,
      title: 'ভূমিকাটি মুছে ফেলবেন?',
      message: 'ভূমিকাটি আর কেউ দেখবেন না। পাঠানো আগ্রহগুলো থেকে যাবে।',
      confirmLabel: 'ভূমিকা মুছুন',
    );
    if (!confirmed || !mounted) return;
    setState(() => _deleting = true);
    try {
      await ref
          .read(ideaRepositoryProvider)
          .deleteRole(widget.ideaId, original.id);
      _done();
    } on Object catch (error) {
      if (mounted) {
        showFailureSnack(context, error, 'ভূমিকাটি মুছে ফেলা যায়নি।');
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  Future<void> _pickSkills() async {
    final picked = await showModalBottomSheet<List<IdeaNamed>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _SkillPicker(selected: _skills),
    );
    if (picked != null) {
      setState(
        () => _skills
          ..clear()
          ..addAll(picked),
      );
    }
  }

  Widget _choices(
    String title,
    List<String> values,
    String? selected,
    String Function(String) label,
    ValueChanged<String> onSelected, {
    String keyPrefix = 'idea-role',
  }) => Padding(
    padding: const EdgeInsets.only(top: KSpacing.md),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        KLocalizedText(title, style: Theme.of(context).textTheme.titleSmall),
        Wrap(
          spacing: KSpacing.sm,
          children: [
            for (final value in values)
              ChoiceChip(
                key: ValueKey('$keyPrefix-$value'),
                label: KLocalizedText(label(value)),
                selected: selected == value,
                onSelected: (_) => onSelected(value),
              ),
          ],
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(KSpacing.md),
        children: [
          const IdeaStaticNotice(
            text:
                'সারাংশ সবার জন্য খোলা থাকলে ভূমিকার বিবরণও সবাই দেখবেন। এখানে গোপন কিছু লিখবেন না।',
          ),
          _choices(
            'কোন ধরনের মানুষ দরকার',
            IdeaRoleTypes.all,
            _roleType,
            ideaRoleTypeLabel,
            (value) => setState(() => _roleType = value),
            keyPrefix: 'idea-role-type',
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            key: const ValueKey('idea-role-title'),
            label: 'ভূমিকার নাম (ঐচ্ছিক)',
            controller: _title,
            validator: (value) => (value?.trim().length ?? 0) > 80
                ? 'ভূমিকার নাম সর্বোচ্চ ৮০ অক্ষরের হতে পারে।'
                : null,
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            key: const ValueKey('idea-role-description'),
            label: 'কী কাজ করবেন (ঐচ্ছিক)',
            controller: _description,
            minLines: 2,
            maxLines: 5,
            validator: (value) => (value?.trim().length ?? 0) > 500
                ? 'ভূমিকার বিবরণ সর্বোচ্চ ৫০০ অক্ষরের হতে পারে।'
                : null,
          ),
          const SizedBox(height: KSpacing.md),
          Row(
            children: [
              Expanded(
                child: KLocalizedText(
                  'ভূমিকার দরকারি দক্ষতা',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
              TextButton.icon(
                key: const ValueKey('idea-role-skills'),
                onPressed: _pickSkills,
                icon: const Icon(Icons.add),
                label: const KLocalizedText('ভূমিকার দক্ষতা বাছুন'),
              ),
            ],
          ),
          if (_skills.isEmpty)
            const KLocalizedText(
              'দক্ষতা দিলে KAAJ মানানসই মানুষ খুঁজে দেখাতে পারে।',
              style: TextStyle(color: KColors.textSecondary),
            )
          else
            Wrap(
              spacing: KSpacing.xs,
              children: [
                for (final skill in _skills)
                  InputChip(
                    label: Text(skill.nameFor(language)),
                    onDeleted: () => setState(() => _skills.remove(skill)),
                  ),
              ],
            ),
          _choices(
            'কতটা সময় লাগবে',
            IdeaTimeCommitments.all,
            _time,
            ideaTimeLabel,
            (value) => setState(() => _time = value),
            keyPrefix: 'idea-role-time',
          ),
          _choices(
            'কী শর্তে',
            IdeaArrangements.all,
            _arrangement,
            ideaArrangementLabel,
            (value) => setState(() => _arrangement = value),
            keyPrefix: 'idea-role-arrangement',
          ),
          if (widget.original != null)
            _choices(
              'ভূমিকার অবস্থা',
              IdeaRoleStatuses.all,
              _status,
              ideaRoleStatusLabel,
              (value) => setState(() => _status = value),
              keyPrefix: 'idea-role-status',
            ),
          const SizedBox(height: KSpacing.lg),
          if (_error case final error?) ...[
            Text(
              error,
              key: const ValueKey('idea-role-error'),
              style: const TextStyle(color: KColors.danger),
            ),
            const SizedBox(height: KSpacing.sm),
          ],
          KPrimaryButton(
            key: const ValueKey('idea-role-save'),
            label: 'ভূমিকা সংরক্ষণ করুন',
            isLoading: _saving,
            onPressed: _save,
          ),
          if (widget.original != null) ...[
            const SizedBox(height: KSpacing.md),
            OutlinedButton.icon(
              key: const ValueKey('idea-role-delete'),
              style: OutlinedButton.styleFrom(foregroundColor: KColors.danger),
              onPressed: _deleting ? null : _delete,
              icon: const Icon(Icons.delete_outline),
              label: const KLocalizedText('ভূমিকা মুছুন'),
            ),
          ],
        ],
      ),
    );
  }
}

/// Up to ten skills from the skill catalog.
class _SkillPicker extends ConsumerStatefulWidget {
  const _SkillPicker({required this.selected});

  final List<IdeaNamed> selected;

  @override
  ConsumerState<_SkillPicker> createState() => _SkillPickerState();
}

class _SkillPickerState extends ConsumerState<_SkillPicker> {
  late final _chosen = {for (final skill in widget.selected) skill.id: skill};
  String _query = '';

  static const _max = 10;

  IdeaNamed _named(CatalogSkill skill) =>
      IdeaNamed(id: skill.id, nameEn: skill.nameEn, nameBn: skill.nameBn);

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final skills = ref.watch(catalogSkillsProvider);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.8,
      maxChildSize: 0.95,
      builder: (context, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: KSpacing.md),
            child: TextField(
              key: const ValueKey('idea-skill-search'),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: KaajLocalizations.text(context, 'দক্ষতা খুঁজুন'),
              ),
              onChanged: (value) =>
                  setState(() => _query = value.trim().toLowerCase()),
            ),
          ),
          Expanded(
            child: skills.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(
                child: TextButton(
                  onPressed: () => ref.invalidate(catalogSkillsProvider),
                  child: Text(
                    failureText(
                      context,
                      error,
                      'দক্ষতার তালিকা লোড করা যায়নি।',
                    ),
                  ),
                ),
              ),
              data: (items) {
                final shown = items
                    .where(
                      (skill) =>
                          _query.isEmpty ||
                          skill.nameEn.toLowerCase().contains(_query) ||
                          skill.nameBn.contains(_query),
                    )
                    .toList(growable: false);
                return ListView.builder(
                  controller: controller,
                  itemCount: shown.length,
                  itemBuilder: (context, index) {
                    final skill = shown[index];
                    final checked = _chosen.containsKey(skill.id);
                    return CheckboxListTile(
                      key: ValueKey('idea-skill-${skill.id}'),
                      value: checked,
                      title: Text(skill.nameFor(language)),
                      onChanged: !checked && _chosen.length >= _max
                          ? null
                          : (on) => setState(() {
                              if (on ?? false) {
                                _chosen[skill.id] = _named(skill);
                              } else {
                                _chosen.remove(skill.id);
                              }
                            }),
                    );
                  },
                );
              },
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(KSpacing.md),
              child: FilledButton(
                key: const ValueKey('idea-skill-done'),
                onPressed: () =>
                    Navigator.pop(context, _chosen.values.toList()),
                child: Text(
                  ideaLabelled(
                    context,
                    'দক্ষতা বাছাই শেষ',
                    '${KFormat.count(context, _chosen.length)}/${KFormat.count(context, _max)}',
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// `/ideas/:id/roles/:roleId/matches` (owner): people KAAJ suggests for a
/// role, with the reasons.
class IdeaRoleMatchesScreen extends ConsumerWidget {
  const IdeaRoleMatchesScreen({
    required this.ideaId,
    required this.roleId,
    super.key,
  });

  final String ideaId;
  final String roleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = (ideaId: ideaId, roleId: roleId);
    final matches = ref.watch(ideaRoleMatchesProvider(key));
    final language = Localizations.localeOf(context).languageCode;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('মানানসই মানুষ')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(ideaRoleMatchesProvider(key));
          await ref
              .read(ideaRoleMatchesProvider(key).future)
              .then<void>((_) {}, onError: (_) {});
        },
        child: matches.when(
          skipLoadingOnRefresh: true,
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => IdeaLoadError(
            error: error,
            onRetry: () => ref.invalidate(ideaRoleMatchesProvider(key)),
          ),
          data: (data) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(KSpacing.md),
            children: [
              Card(
                key: const ValueKey('idea-matches-explanation'),
                child: Padding(
                  padding: const EdgeInsets.all(KSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (data.source == 'FROM_KAAJ' || data.source.isEmpty)
                        const IdeaBadge(
                          label: 'KAAJ-এর পরামর্শ',
                          color: KColors.info,
                        ),
                      if (!data.explanation.isEmpty)
                        Text(data.explanation.forLanguage(language)),
                    ],
                  ),
                ),
              ),
              if (data.items.isEmpty)
                const KEmptyState(
                  icon: Icons.people_alt_outlined,
                  title: 'এখনো মানানসই কেউ নেই',
                  message:
                      'ভূমিকায় দক্ষতা যোগ করুন, অথবা পরে আবার দেখুন। শুধু যাঁরা খুঁজে পাওয়ার অনুমতি দিয়েছেন তাঁরাই এখানে আসেন।',
                ),
              for (final match in data.items)
                Card(
                  key: ValueKey('idea-match-${match.userId}'),
                  margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
                  child: Padding(
                    padding: const EdgeInsets.all(KSpacing.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const CircleAvatar(
                              child: Icon(Icons.person_outline),
                            ),
                            const SizedBox(width: KSpacing.sm),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    match.displayName,
                                    style: theme.textTheme.titleSmall,
                                  ),
                                  if (match.area case final area?)
                                    Text(
                                      area.nameFor(language),
                                      style: theme.textTheme.bodySmall,
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (match.matchedSkills.isNotEmpty)
                          Wrap(
                            spacing: KSpacing.xs,
                            children: [
                              for (final skill in match.matchedSkills)
                                Chip(
                                  visualDensity: VisualDensity.compact,
                                  avatar: skill.verified
                                      ? const Icon(Icons.verified, size: 16)
                                      : null,
                                  label: Text(skill.nameFor(language)),
                                ),
                            ],
                          ),
                        for (final reason in match.reasons)
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(
                                Icons.check,
                                size: 16,
                                color: KColors.primary,
                              ),
                              const SizedBox(width: KSpacing.xs),
                              Expanded(
                                child: Text(reason.text.forLanguage(language)),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

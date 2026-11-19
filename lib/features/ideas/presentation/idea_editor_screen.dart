import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/failure_copy.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../../core/widgets/k_text_field.dart';
import '../../catalog/presentation/widgets/area_picker.dart';
import '../domain/idea_models.dart';
import '../idea_routes.dart';
import 'idea_providers.dart';
import 'idea_widgets.dart';

/// `/ideas/new` and `/ideas/:id/edit`: one form in sections. What anyone
/// may see (title, summary) comes first, then the private part.
class IdeaEditorScreen extends ConsumerWidget {
  const IdeaEditorScreen({this.ideaId, super.key});

  final String? ideaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ideaId;
    if (id == null) {
      return const _EditorScaffold(child: _IdeaForm());
    }
    final idea = ref.watch(ideaDetailProvider(id));
    return _EditorScaffold(
      editing: true,
      child: idea.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => IdeaLoadError(
          error: error,
          onRetry: () => ref.invalidate(ideaDetailProvider(id)),
        ),
        data: (idea) => idea.isOwner
            ? _IdeaForm(original: idea)
            : IdeaLoadError(
                error: const Failure(
                  kind: FailureKind.notFound,
                  message: 'Not available',
                ),
                onRetry: () => ref.invalidate(ideaDetailProvider(id)),
                onOpenIdea: () => context.pushReplacement(IdeaPaths.detail(id)),
              ),
      ),
    );
  }
}

class _EditorScaffold extends StatelessWidget {
  const _EditorScaffold({required this.child, this.editing = false});

  final Widget child;
  final bool editing;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: KLocalizedText(editing ? 'আইডিয়া সম্পাদনা' : 'নতুন আইডিয়া'),
    ),
    body: child,
  );
}

class _IdeaForm extends ConsumerStatefulWidget {
  const _IdeaForm({this.original});

  final Idea? original;

  @override
  ConsumerState<_IdeaForm> createState() => _IdeaFormState();
}

class _IdeaFormState extends ConsumerState<_IdeaForm> {
  final _form = GlobalKey<FormState>();
  late final _title = TextEditingController(text: widget.original?.title);
  late final _summary = TextEditingController(text: widget.original?.summary);
  late final _problem = TextEditingController(
    text: widget.original?.details?.problem,
  );
  late final _solution = TextEditingController(
    text: widget.original?.details?.solution,
  );
  late final _details = TextEditingController(
    text: widget.original?.details?.details,
  );
  late String? _categoryId = widget.original?.category?.id;
  late String? _areaId = widget.original?.area?.id;
  late String? _areaName;
  late String _stage = IdeaStages.open.contains(widget.original?.stage)
      ? widget.original!.stage
      : IdeaStages.concept;
  late String _visibility =
      widget.original?.visibility ?? IdeaVisibilities.private;
  bool _saving = false;
  bool _deleting = false;
  String? _error;
  bool _sectorMissing = false;

  bool get _editing => widget.original != null;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final language = Localizations.localeOf(context).languageCode;
    _areaName = widget.original?.area?.nameFor(language);
  }

  @override
  void dispose() {
    for (final controller in [
      _title,
      _summary,
      _problem,
      _solution,
      _details,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  static String? Function(String?) _length(int min, int max, String message) =>
      (value) {
        final length = value?.trim().length ?? 0;
        return length < min || length > max ? message : null;
      };

  Future<void> _submit() async {
    if (_saving) return;
    final valid = _form.currentState?.validate() ?? false;
    setState(() => _sectorMissing = _categoryId == null);
    if (!valid || _categoryId == null) return;
    final draft = IdeaDraft(
      title: _title.text,
      summary: _summary.text,
      problem: _problem.text,
      solution: _solution.text,
      details: _details.text,
      categoryId: _categoryId!,
      locationId: _areaId,
      stage: _stage,
      visibility: _visibility,
    );
    setState(() {
      _saving = true;
      _error = null;
    });
    final repository = ref.read(ideaRepositoryProvider);
    try {
      final original = widget.original;
      if (original == null) {
        final idea = await repository.create(draft);
        ref.invalidate(myIdeasProvider);
        if (mounted) context.pushReplacement(IdeaPaths.detail(idea.id));
      } else {
        final patch = draft.toPatchJson(original);
        if (patch.isNotEmpty) await repository.update(original.id, patch);
        ref
          ..invalidate(myIdeasProvider)
          ..invalidate(ideaDetailProvider(original.id));
        if (mounted) context.pop();
      }
    } on Object catch (error) {
      if (mounted) {
        // The shared copy for this code talks about mentoring; ideas
        // need their own words.
        final identity = ErrorMapper.from(error).code == 'IDENTITY_REQUIRED';
        setState(
          () => _error = identity
              ? KaajLocalizations.text(
                  context,
                  'সারাংশ সবার জন্য খুলতে আগে পরিচয় (এনআইডি ও সেলফি) যাচাই করুন। এখন গোপন রেখে সংরক্ষণ করতে পারেন।',
                )
              : failureText(
                  context,
                  error,
                  'আইডিয়াটি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
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
      title: 'আইডিয়াটি মুছে ফেলবেন?',
      message:
          'আইডিয়া, এর ভূমিকা ও দেখার অনুমতি মুছে যাবে। এটি আর ফেরানো যাবে না।',
      confirmLabel: 'আইডিয়া মুছুন',
    );
    if (!confirmed || !mounted) return;
    setState(() => _deleting = true);
    try {
      await ref.read(ideaRepositoryProvider).delete(original.id);
      ref.invalidate(myIdeasProvider);
      if (mounted) context.pop(true);
    } on Object catch (error) {
      if (mounted) {
        showFailureSnack(context, error, 'আইডিয়াটি মুছে ফেলা যায়নি।');
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final sectors = ref.watch(ideaSectorsProvider);
    final converted = widget.original?.isConverted ?? false;
    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(KSpacing.md),
        children: [
          KLocalizedText(
            'সবাই যা দেখতে পারেন',
            style: theme.textTheme.titleMedium,
          ),
          const KLocalizedText(
            'শিরোনাম ও সারাংশে গোপন কিছু লিখবেন না।',
            style: TextStyle(color: KColors.textSecondary),
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            key: const ValueKey('idea-title'),
            label: 'আইডিয়ার শিরোনাম',
            controller: _title,
            validator: _length(3, 120, 'শিরোনাম ৩ থেকে ১২০ অক্ষরের হতে হবে।'),
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            key: const ValueKey('idea-summary'),
            label: 'এক লাইনের সারাংশ',
            helperText: 'খোঁজে এই লাইনটিই দেখা যায়।',
            controller: _summary,
            maxLines: 2,
            validator: _length(10, 160, 'সারাংশ ১০ থেকে ১৬০ অক্ষরের হতে হবে।'),
          ),
          const SizedBox(height: KSpacing.sm),
          sectors.when(
            loading: () => const LinearProgressIndicator(),
            error: (error, _) => TextButton.icon(
              onPressed: () => ref.invalidate(ideaSectorsProvider),
              icon: const Icon(Icons.refresh),
              label: Text(
                failureText(context, error, 'খাতের তালিকা লোড করা যায়নি।'),
              ),
            ),
            data: (items) => DropdownButtonFormField<String>(
              key: const ValueKey('idea-sector'),
              initialValue: items.any((item) => item.id == _categoryId)
                  ? _categoryId
                  : null,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: KaajLocalizations.text(context, 'আইডিয়ার খাত'),
                errorText: _sectorMissing
                    ? KaajLocalizations.text(context, 'একটি খাত বেছে নিন।')
                    : null,
              ),
              items: [
                for (final sector in items)
                  DropdownMenuItem(
                    value: sector.id,
                    child: Text(sector.nameFor(language)),
                  ),
              ],
              onChanged: (value) => setState(() {
                _categoryId = value;
                _sectorMissing = false;
              }),
            ),
          ),
          Card(
            margin: const EdgeInsets.only(top: KSpacing.sm),
            child: ListTile(
              key: const ValueKey('idea-area'),
              leading: const Icon(Icons.location_on_outlined),
              title: const KLocalizedText('আইডিয়ার এলাকা (ঐচ্ছিক)'),
              subtitle: _areaName == null
                  ? const KLocalizedText('এখনো বেছে নেওয়া হয়নি')
                  : Text(_areaName!),
              trailing: _areaId == null
                  ? const KLocalizedText('বদলান')
                  : IconButton(
                      tooltip: KaajLocalizations.text(
                        context,
                        'আইডিয়ার এলাকা সরান',
                      ),
                      icon: const Icon(Icons.close),
                      onPressed: () => setState(() {
                        _areaId = null;
                        _areaName = null;
                      }),
                    ),
              onTap: () async {
                final place = await showAreaPickerSheet(
                  context,
                  selectedId: _areaId,
                );
                if (place != null) {
                  setState(() {
                    _areaId = place.id;
                    _areaName = place.nameFor(language);
                  });
                }
              },
            ),
          ),
          if (!converted) ...[
            const SizedBox(height: KSpacing.md),
            KLocalizedText(
              'আইডিয়ার পর্যায়',
              style: theme.textTheme.titleSmall,
            ),
            Wrap(
              spacing: KSpacing.sm,
              children: [
                for (final stage in IdeaStages.open)
                  ChoiceChip(
                    key: ValueKey('idea-stage-$stage'),
                    label: KLocalizedText(ideaStageLabel(stage)),
                    selected: _stage == stage,
                    onSelected: (_) => setState(() => _stage = stage),
                  ),
              ],
            ),
          ],
          const SizedBox(height: KSpacing.lg),
          KLocalizedText('গোপন অংশ', style: theme.textTheme.titleMedium),
          const KLocalizedText(
            'শুধু আপনি, আপনার দল ও আপনার অনুমতি পাওয়া মানুষ এটি দেখবেন। প্রতিবার দেখা আপনার কাছে লেখা থাকে।',
            style: TextStyle(color: KColors.textSecondary),
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            key: const ValueKey('idea-problem'),
            label: 'কোন সমস্যার সমাধান করবে',
            controller: _problem,
            minLines: 3,
            maxLines: 6,
            validator: _length(10, 2000, '১০ থেকে ২০০০ অক্ষরের মধ্যে লিখুন।'),
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            key: const ValueKey('idea-solution'),
            label: 'আপনার সমাধান',
            controller: _solution,
            minLines: 3,
            maxLines: 6,
            validator: _length(10, 2000, '১০ থেকে ২০০০ অক্ষরের মধ্যে লিখুন।'),
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            key: const ValueKey('idea-details'),
            label: 'আরও বিস্তারিত (ঐচ্ছিক)',
            controller: _details,
            minLines: 3,
            maxLines: 10,
            validator: _length(0, 5000, 'সর্বোচ্চ ৫০০০ অক্ষর লিখুন।'),
          ),
          const SizedBox(height: KSpacing.lg),
          KLocalizedText('কে দেখতে পাবেন', style: theme.textTheme.titleMedium),
          RadioGroup<String>(
            groupValue: _visibility,
            onChanged: (value) {
              if (value != null) setState(() => _visibility = value);
            },
            child: Column(
              children: [
                for (final visibility in IdeaVisibilities.all)
                  RadioListTile<String>(
                    key: ValueKey('idea-visibility-$visibility'),
                    contentPadding: EdgeInsets.zero,
                    value: visibility,
                    title: KLocalizedText(ideaVisibilityLabel(visibility)),
                    subtitle: KLocalizedText(
                      ideaVisibilityExplanation(visibility),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: KSpacing.md),
          if (_error case final error?) ...[
            Semantics(
              liveRegion: true,
              child: Text(
                error,
                key: const ValueKey('idea-editor-error'),
                style: const TextStyle(color: KColors.danger),
              ),
            ),
            const SizedBox(height: KSpacing.sm),
          ],
          KPrimaryButton(
            key: const ValueKey('idea-save'),
            label: _editing ? 'পরিবর্তন সংরক্ষণ করুন' : 'আইডিয়া সংরক্ষণ করুন',
            isLoading: _saving,
            onPressed: _submit,
          ),
          if (_editing) ...[
            const SizedBox(height: KSpacing.lg),
            OutlinedButton.icon(
              key: const ValueKey('idea-delete'),
              style: OutlinedButton.styleFrom(foregroundColor: KColors.danger),
              onPressed: _deleting ? null : _delete,
              icon: const Icon(Icons.delete_outline),
              label: const KLocalizedText('আইডিয়াটি মুছে ফেলুন'),
            ),
          ],
        ],
      ),
    );
  }
}

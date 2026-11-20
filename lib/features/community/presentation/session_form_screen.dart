import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/kaaj_format.dart';
import '../../../core/formatting/latin_digits_formatter.dart';
import '../../../core/formatting/money.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_text_field.dart';
import '../../catalog/presentation/widgets/area_picker.dart';
import '../../mentor/domain/mentor_models.dart';
import '../../mentor/presentation/mentor_providers.dart';
import '../community_routes.dart';
import '../domain/community_models.dart';
import 'community_providers.dart';
import 'community_widgets.dart';

/// Creates a hosted session (approved mentors), a group session (group
/// moderators and ambassadors, [groupId]) or edits one ([sessionId]).
class SessionFormScreen extends ConsumerWidget {
  const SessionFormScreen({this.sessionId, this.groupId, super.key});

  final String? groupId;
  final String? sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = sessionId != null
        ? 'সেশন সম্পাদনা'
        : groupId != null
        ? 'দলের নতুন সেশন'
        : 'নতুন সেশন';
    return Scaffold(
      appBar: AppBar(title: KLocalizedText(title)),
      body: _content(context, ref),
    );
  }

  Widget _content(BuildContext context, WidgetRef ref) {
    if (sessionId != null) {
      return CommunityAsync<CommunitySession>(
        value: ref.watch(sessionProvider(sessionId!)),
        errorLabel: 'সেশনটি লোড করা যায়নি।',
        onRetry: () => ref.invalidate(sessionProvider(sessionId!)),
        builder: (session) => session.isHost && session.isOpen
            ? _SessionForm(existing: session, groupId: session.groupId)
            : const NotAvailableState(),
      );
    }
    if (groupId != null) {
      return CommunityAsync<CommunityGroup>(
        value: ref.watch(groupProvider(groupId!)),
        errorLabel: 'দলের তথ্য লোড করা যায়নি।',
        onRetry: () => ref.invalidate(groupProvider(groupId!)),
        builder: (group) => group.canAnnounce
            ? _SessionForm(groupId: group.id, forcedWomenOnly: group.womenOnly)
            : const NotAvailableState(),
      );
    }
    // Hosting needs an approved mentor; the server checks it too.
    final mentor = ref.watch(mentorProfileProvider);
    return mentor.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const _SessionForm(),
      data: (profile) => profile.status == MentorStatus.approved
          ? const _SessionForm()
          : ListView(
              padding: const EdgeInsets.all(KSpacing.md),
              children: [
                KEmptyState(
                  icon: Icons.verified_user_outlined,
                  title: 'সেশন আয়োজন করতে মেন্টর হোন',
                  message:
                      'সেশন আয়োজন করতে অনুমোদিত মেন্টর হতে হয়। মেন্টর পাতা থেকে আবেদন করুন।',
                  actionLabel: 'মেন্টর পাতা খুলুন',
                  onAction: () => context.push(AppRoutes.mentor),
                ),
              ],
            ),
    );
  }
}

class _SessionForm extends ConsumerStatefulWidget {
  const _SessionForm({
    this.existing,
    this.groupId,
    this.forcedWomenOnly = false,
  });

  final CommunitySession? existing;
  final bool forcedWomenOnly;
  final String? groupId;

  @override
  ConsumerState<_SessionForm> createState() => _SessionFormState();
}

class _SessionFormState extends ConsumerState<_SessionForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _title;
  late final TextEditingController _description;
  late final TextEditingController _capacity;
  late final TextEditingController _link;
  late final TextEditingController _amount;
  late SessionKind _kind;
  late DateTime _startsAt;
  late int _minutes;
  late SessionMode _mode;
  String? _areaId;
  String _areaName = '';
  late String _price;
  late bool _womenOnly;
  late bool _homeBased;
  bool _saving = false;
  String? _error;

  bool get _editing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final s = widget.existing;
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    _title = TextEditingController(text: s?.title ?? '');
    _description = TextEditingController(text: s?.description ?? '');
    _capacity = TextEditingController(text: '${s?.capacity ?? 20}');
    _link = TextEditingController(text: s?.onlineLink ?? '');
    final price = Money.tryParse(s?.pricePoisha);
    _amount = TextEditingController(
      text: price == null ? '' : '${price.wholeTaka}',
    );
    _kind = s?.kind ?? SessionKind.groupDiscussion;
    _startsAt =
        s?.startsAt?.toLocal() ??
        DateTime(tomorrow.year, tomorrow.month, tomorrow.day, 10);
    _minutes = s?.durationMinutes ?? 60;
    _mode = s?.mode ?? SessionMode.inPerson;
    _areaId = s?.area?.id;
    _price = s?.priceModel ?? 'FREE';
    _womenOnly = widget.forcedWomenOnly || (s?.womenOnly ?? false);
    _homeBased = s?.homeBasedFriendly ?? false;
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _capacity.dispose();
    _link.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _pickStart() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _startsAt,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 366)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_startsAt),
    );
    if (time == null) return;
    setState(
      () => _startsAt = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      ),
    );
  }

  Future<void> _save() async {
    if (_saving || !(_form.currentState?.validate() ?? false)) return;
    String? problem;
    if (_mode == SessionMode.inPerson && _areaId == null) {
      problem = 'সরাসরি সেশনের জন্য এলাকা বেছে নিন।';
    } else if (!_editing && !_startsAt.isAfter(DateTime.now())) {
      problem = 'শুরুর সময় ভবিষ্যতে হতে হবে।';
    }
    if (problem != null) {
      setState(() => _error = KaajLocalizations.text(context, problem!));
      return;
    }
    final taka = int.tryParse(latinDigits(_amount.text.trim()));
    final draft = SessionDraft(
      kind: _kind,
      title: _title.text,
      description: _description.text,
      startsAt: _startsAt,
      durationMinutes: _minutes,
      capacity: int.parse(latinDigits(_capacity.text.trim())),
      mode: _mode,
      locationId: _areaId,
      onlineLink: _link.text,
      priceModel: _price,
      pricePoisha: _price == 'CASH' && taka != null ? '${taka * 100}' : null,
      womenOnly: _womenOnly,
      homeBasedFriendly: _homeBased,
    );
    setState(() {
      _saving = true;
      _error = null;
    });
    final repository = ref.read(communityRepositoryProvider);
    try {
      final CommunitySession saved;
      if (_editing) {
        saved = await repository.updateSession(
          widget.existing!.id,
          draft,
          includeWomenOnly: widget.groupId == null,
        );
      } else if (widget.groupId != null) {
        saved = await repository.createGroupSession(widget.groupId!, draft);
      } else {
        saved = await repository.createSession(draft);
      }
      ref
        ..invalidate(sessionProvider(saved.id))
        ..invalidate(sessionsProvider)
        ..invalidate(groupSessionsProvider);
      if (!mounted) return;
      if (_editing) {
        showCommunitySnack(context, 'সেশন সংরক্ষণ হয়েছে।');
        context.pop();
      } else {
        showCommunitySnack(
          context,
          'খসড়া তৈরি হয়েছে। প্রকাশ করলে মানুষ দেখতে পাবেন।',
        );
        context.pushReplacement(CommunityPaths.session(saved.id));
      }
    } on Object catch (error) {
      if (!mounted) return;
      setState(
        () => _error = communityFailureText(
          context,
          error,
          'সেশন সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
          codes: const {
            'WOMEN_ONLY':
                'শুধু নারীদের সেশন আয়োজন করতে প্রোফাইলে লিঙ্গ নারী দেওয়া থাকতে হয়।',
          },
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final areaLabel = _areaName.isNotEmpty
        ? _areaName
        : widget.existing?.area?.nameFor(language) ?? '';
    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(KSpacing.md),
        children: [
          KLocalizedText('ধরন', style: theme.textTheme.titleSmall),
          Wrap(
            spacing: KSpacing.xs,
            children: [
              for (final kind in SessionKind.hosted)
                ChoiceChip(
                  key: ValueKey('session-kind-${kind.wire}'),
                  label: KLocalizedText(sessionKindLabel(kind)),
                  selected: _kind == kind,
                  onSelected: _editing
                      ? null
                      : (_) => setState(() => _kind = kind),
                ),
            ],
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            key: const ValueKey('session-title'),
            label: 'শিরোনাম',
            controller: _title,
            validator: (value) {
              final length = value?.trim().length ?? 0;
              return length < 3 || length > 120
                  ? '৩ থেকে ১২০ অক্ষরের মধ্যে লিখুন।'
                  : null;
            },
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            key: const ValueKey('session-description'),
            label: 'বিবরণ (ঐচ্ছিক)',
            controller: _description,
            maxLines: 5,
            minLines: 2,
            validator: (value) => (value?.trim().length ?? 0) > 2000
                ? 'সর্বোচ্চ ২০০০ অক্ষর লেখা যাবে।'
                : null,
          ),
          ListTile(
            key: const ValueKey('session-start'),
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.play_arrow_outlined),
            title: const KLocalizedText('শুরু'),
            subtitle: Text(KFormat.dayAndTime(context, _startsAt)),
            trailing: const KLocalizedText('বদলান'),
            onTap: _pickStart,
          ),
          KLocalizedText('কতক্ষণ', style: theme.textTheme.titleSmall),
          Wrap(
            spacing: KSpacing.xs,
            children: [
              for (final minutes in {30, 60, 90, 120, 180, 240, _minutes})
                ChoiceChip(
                  key: ValueKey('session-minutes-$minutes'),
                  label: Text(
                    '${KFormat.count(context, minutes)} '
                    '${language == 'en' ? 'min' : 'মিনিট'}',
                  ),
                  selected: _minutes == minutes,
                  onSelected: (_) => setState(() => _minutes = minutes),
                ),
            ],
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            key: const ValueKey('session-capacity'),
            label: 'কতজন যোগ দিতে পারবেন',
            controller: _capacity,
            keyboardType: TextInputType.number,
            validator: (value) {
              final count = int.tryParse(latinDigits(value?.trim() ?? ''));
              return count == null || count < 1 || count > 1000
                  ? '১ থেকে ১০০০ এর মধ্যে লিখুন।'
                  : null;
            },
          ),
          const SizedBox(height: KSpacing.md),
          KLocalizedText('কীভাবে হবে', style: theme.textTheme.titleSmall),
          Wrap(
            spacing: KSpacing.xs,
            children: [
              for (final mode in SessionMode.values)
                ChoiceChip(
                  key: ValueKey('session-mode-${mode.wire}'),
                  label: KLocalizedText(sessionModeLabel(mode)),
                  selected: _mode == mode,
                  onSelected: (_) => setState(() => _mode = mode),
                ),
            ],
          ),
          if (_mode == SessionMode.inPerson)
            Card(
              margin: const EdgeInsets.only(top: KSpacing.sm),
              child: ListTile(
                key: const ValueKey('session-area'),
                leading: const Icon(Icons.location_on_outlined),
                title: const KLocalizedText('এলাকা'),
                subtitle: areaLabel.isEmpty
                    ? const KLocalizedText('এখনো বেছে নেওয়া হয়নি')
                    : Text(areaLabel),
                trailing: const KLocalizedText('বদলান'),
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
          if (_mode == SessionMode.inPerson)
            const KLocalizedText(
              'শুধু এলাকা দেখানো হয়, কখনো ঠিকানা নয়। ঠিকানা চ্যাটে জানান।',
            ),
          if (_mode == SessionMode.online)
            KTextField(
              key: const ValueKey('session-link'),
              label: 'অনলাইন লিঙ্ক (https://…)',
              helperText:
                  'প্রকাশের আগে লিঙ্ক দিতে হবে। শুধু নিশ্চিত মানুষেরা দেখবেন।',
              controller: _link,
              keyboardType: TextInputType.url,
              validator: (value) {
                final text = value?.trim() ?? '';
                if (text.isEmpty) return null;
                final uri = Uri.tryParse(text);
                return uri == null || uri.scheme != 'https' || uri.host.isEmpty
                    ? 'https দিয়ে শুরু হওয়া সঠিক লিঙ্ক দিন।'
                    : null;
              },
            ),
          const SizedBox(height: KSpacing.md),
          KLocalizedText('মূল্য', style: theme.textTheme.titleSmall),
          SegmentedButton<String>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: 'FREE', label: KLocalizedText('বিনামূল্যে')),
              ButtonSegment(value: 'CASH', label: KLocalizedText('নগদে')),
            ],
            selected: {_price},
            onSelectionChanged: (value) => setState(() => _price = value.first),
          ),
          if (_price == 'CASH')
            KTextField(
              key: const ValueKey('session-price'),
              label: 'প্রত্যেকে কত টাকা দেবেন (সেখানেই নগদে)',
              controller: _amount,
              keyboardType: TextInputType.number,
              validator: (value) {
                final amount = int.tryParse(latinDigits(value?.trim() ?? ''));
                return amount == null || amount <= 0
                    ? 'সঠিক টাকার পরিমাণ লিখুন।'
                    : null;
              },
            ),
          SwitchListTile(
            key: const ValueKey('session-women-only'),
            contentPadding: EdgeInsets.zero,
            value: _womenOnly,
            onChanged: widget.forcedWomenOnly || widget.groupId != null
                ? null
                : (value) => setState(() => _womenOnly = value),
            title: const KLocalizedText('শুধু নারীদের জন্য'),
            subtitle: KLocalizedText(
              widget.forcedWomenOnly
                  ? 'শুধু নারীদের দলের সব সেশন শুধু নারীদের জন্য।'
                  : 'আপনার ও অংশগ্রহণকারীদের প্রোফাইলে লিঙ্গ নারী দেওয়া থাকতে হবে; সার্ভার এটি যাচাই করে।',
            ),
          ),
          SwitchListTile(
            key: const ValueKey('session-home-based'),
            contentPadding: EdgeInsets.zero,
            value: _homeBased,
            onChanged: (value) => setState(() => _homeBased = value),
            title: const KLocalizedText('ঘরে থেকে কাজের উপযোগী'),
          ),
          if (_error != null) ...[
            const SizedBox(height: KSpacing.sm),
            Text(
              _error!,
              key: const ValueKey('session-form-error'),
              style: const TextStyle(color: KColors.danger),
            ),
          ],
          const SizedBox(height: KSpacing.lg),
          FilledButton(
            key: const ValueKey('session-save'),
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : KLocalizedText(_editing ? 'সংরক্ষণ করুন' : 'খসড়া তৈরি করুন'),
          ),
        ],
      ),
    );
  }
}

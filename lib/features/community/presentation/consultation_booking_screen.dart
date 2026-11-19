import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_text_field.dart';
import '../../catalog/domain/entities/service_location.dart';
import '../../catalog/presentation/widgets/area_picker.dart';
import '../community_routes.dart';
import '../domain/community_models.dart';
import 'community_providers.dart';
import 'community_widgets.dart';

const _bookingCodes = {
  'NOT_FOUND': 'এই বিশেষজ্ঞ এখন পরামর্শ নিচ্ছেন না।',
  'SLOT_UNAVAILABLE': 'বিশেষজ্ঞ ওই সময়ে ফাঁকা নেই। অন্য সময় বেছে নিন।',
};

/// One possible start inside an expert free slot.
class _Start {
  const _Start(this.at, this.slotEnd);

  final DateTime at;
  final DateTime slotEnd;
}

/// Starts every 30 minutes inside each slot, at least 15 minutes ahead.
List<_Start> _startsFrom(List<ExpertSlot> slots, DateTime now) {
  final earliest = now.add(const Duration(minutes: 15));
  final starts = <_Start>[];
  for (final slot in slots) {
    var at = slot.startsAt;
    var count = 0;
    while (slot.endsAt.difference(at).inMinutes >= 15 && count < 16) {
      if (!at.isBefore(earliest)) starts.add(_Start(at, slot.endsAt));
      at = at.add(const Duration(minutes: 30));
      count++;
    }
  }
  starts.sort((a, b) => a.at.compareTo(b.at));
  return starts;
}

/// Books a one to one consultation with an expert in one of their free
/// times. The expert confirms it and sets the price (free or cash).
class ConsultationBookingScreen extends ConsumerStatefulWidget {
  const ConsultationBookingScreen({
    required this.expertUserId,
    this.expertName,
    this.introductionId,
    super.key,
  });

  final String expertUserId;
  final String? expertName;
  final String? introductionId;

  @override
  ConsumerState<ConsultationBookingScreen> createState() =>
      _ConsultationBookingScreenState();
}

class _ConsultationBookingScreenState
    extends ConsumerState<ConsultationBookingScreen> {
  final _title = TextEditingController();
  final _note = TextEditingController();
  final _form = GlobalKey<FormState>();
  _Start? _start;
  int _minutes = 30;
  SessionMode _mode = SessionMode.inAppChat;
  ServiceLocation? _area;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _note.dispose();
    super.dispose();
  }

  List<int> _durations(_Start start) {
    final room = start.slotEnd.difference(start.at).inMinutes;
    final fits = [
      for (final minutes in const [30, 45, 60, 90, 120, 180])
        if (minutes <= room) minutes,
    ];
    return fits.isEmpty ? [room.clamp(15, 180)] : fits;
  }

  Future<void> _book() async {
    if (_sending || !(_form.currentState?.validate() ?? false)) return;
    final start = _start;
    String? problem;
    if (start == null) {
      problem = 'একটি সময় বেছে নিন।';
    } else if (_mode == SessionMode.inPerson && _area == null) {
      problem = 'সরাসরি সেশনের জন্য এলাকা বেছে নিন।';
    }
    if (problem != null) {
      setState(() => _error = KaajLocalizations.text(context, problem!));
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final session = await ref
          .read(communityRepositoryProvider)
          .bookConsultation(
            ConsultationRequest(
              expertUserId: widget.expertUserId,
              startsAt: start!.at,
              durationMinutes: _minutes,
              mode: _mode,
              locationId: _area?.id,
              title: _title.text,
              note: _note.text,
              introductionId: widget.introductionId,
            ),
          );
      ref.invalidate(sessionsProvider);
      if (!mounted) return;
      showCommunitySnack(
        context,
        'অনুরোধ পাঠানো হয়েছে। বিশেষজ্ঞ নিশ্চিত করলে জানানো হবে।',
      );
      context.pushReplacement(CommunityPaths.session(session.id));
    } on Object catch (error) {
      if (!mounted) return;
      final message = communityFailureText(
        context,
        error,
        'পরামর্শের অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।',
        codes: _bookingCodes,
      );
      setState(() {
        _error = message;
        _start = null;
      });
      ref.invalidate(expertSlotsProvider(widget.expertUserId));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final slots = ref.watch(expertSlotsProvider(widget.expertUserId));
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('পরামর্শের সময় নিন')),
      body: CommunityAsync<List<ExpertSlot>>(
        value: slots,
        errorLabel: 'বিশেষজ্ঞের ফাঁকা সময় লোড করা যায়নি।',
        onRetry: () => ref.invalidate(expertSlotsProvider(widget.expertUserId)),
        builder: (list) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(expertSlotsProvider(widget.expertUserId));
            await ref
                .read(expertSlotsProvider(widget.expertUserId).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: _body(context, _startsFrom(list, DateTime.now())),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, List<_Start> starts) {
    final theme = Theme.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final days = <DateTime, List<_Start>>{};
    for (final start in starts) {
      final local = start.at.toLocal();
      days
          .putIfAbsent(DateTime(local.year, local.month, local.day), () => [])
          .add(start);
    }
    return Form(
      key: _form,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(KSpacing.md),
        children: [
          if (widget.expertName?.isNotEmpty ?? false)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const CircleAvatar(child: Icon(Icons.school_outlined)),
              title: Text(widget.expertName!),
              subtitle: const KLocalizedText('বিশেষজ্ঞ'),
            ),
          const KLocalizedText(
            'কমিউনিটি বিনামূল্যে। বিশেষজ্ঞ নিশ্চিত করার সময় জানাবেন পরামর্শটি বিনামূল্যে, নাকি সেখানেই নগদ টাকায়।',
          ),
          if (widget.introductionId != null) ...[
            const SizedBox(height: KSpacing.sm),
            const KLocalizedText('আপনার গৃহীত পরিচয়ের অনুরোধের সঙ্গে যুক্ত।'),
          ],
          const SizedBox(height: KSpacing.md),
          KLocalizedText(
            'আগামী ১৪ দিনের ফাঁকা সময়',
            style: theme.textTheme.titleSmall,
          ),
          if (days.isEmpty)
            const KEmptyState(
              icon: Icons.event_busy_outlined,
              title: 'কোনো ফাঁকা সময় নেই',
              message:
                  'এই বিশেষজ্ঞের আগামী ১৪ দিনে ফাঁকা সময় নেই। পরে আবার দেখুন বা পরিচয়ের অনুরোধ পাঠান।',
            )
          else
            for (final entry in days.entries) ...[
              Padding(
                padding: const EdgeInsets.only(top: KSpacing.sm),
                child: Text(
                  KFormat.date(context, entry.key),
                  style: theme.textTheme.labelLarge,
                ),
              ),
              Wrap(
                spacing: KSpacing.xs,
                children: [
                  for (final start in entry.value)
                    ChoiceChip(
                      key: ValueKey(
                        'slot-${start.at.toUtc().toIso8601String()}',
                      ),
                      label: Text(KFormat.time(context, start.at)),
                      selected: _start?.at == start.at,
                      onSelected: (_) => setState(() {
                        _start = start;
                        final fits = _durations(start);
                        if (!fits.contains(_minutes)) _minutes = fits.first;
                      }),
                    ),
                ],
              ),
            ],
          if (_start != null) ...[
            const SizedBox(height: KSpacing.md),
            KLocalizedText('কতক্ষণ', style: theme.textTheme.titleSmall),
            Wrap(
              spacing: KSpacing.xs,
              children: [
                for (final minutes in _durations(_start!))
                  ChoiceChip(
                    key: ValueKey('duration-$minutes'),
                    label: Text(
                      '${KFormat.count(context, minutes)} '
                      '${language == 'en' ? 'min' : 'মিনিট'}',
                    ),
                    selected: _minutes == minutes,
                    onSelected: (_) => setState(() => _minutes = minutes),
                  ),
              ],
            ),
          ],
          const SizedBox(height: KSpacing.md),
          KLocalizedText('কীভাবে কথা হবে', style: theme.textTheme.titleSmall),
          Wrap(
            spacing: KSpacing.xs,
            children: [
              for (final mode in SessionMode.values)
                ChoiceChip(
                  key: ValueKey('mode-${mode.wire}'),
                  label: KLocalizedText(sessionModeLabel(mode)),
                  selected: _mode == mode,
                  onSelected: (_) => setState(() => _mode = mode),
                ),
            ],
          ),
          if (_mode == SessionMode.online)
            const KLocalizedText(
              'বিশেষজ্ঞ নিশ্চিত করার সময় অনলাইন লিঙ্ক দেবেন।',
            ),
          if (_mode == SessionMode.inPerson)
            Card(
              margin: const EdgeInsets.only(top: KSpacing.sm),
              child: ListTile(
                key: const ValueKey('booking-area'),
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
          KTextField(
            key: const ValueKey('booking-title'),
            label: 'বিষয় (ঐচ্ছিক)',
            controller: _title,
            validator: (value) {
              final length = value?.trim().length ?? 0;
              return length != 0 && (length < 3 || length > 120)
                  ? '৩ থেকে ১২০ অক্ষরের মধ্যে লিখুন।'
                  : null;
            },
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            key: const ValueKey('booking-note'),
            label: 'বিশেষজ্ঞের জন্য নোট (ঐচ্ছিক)',
            controller: _note,
            maxLines: 4,
            minLines: 2,
            validator: (value) => (value?.trim().length ?? 0) > 1000
                ? 'সর্বোচ্চ ১০০০ অক্ষর লেখা যাবে।'
                : null,
          ),
          if (_error != null) ...[
            const SizedBox(height: KSpacing.md),
            Text(
              _error!,
              key: const ValueKey('booking-error'),
              style: const TextStyle(color: KColors.danger),
            ),
          ],
          const SizedBox(height: KSpacing.lg),
          FilledButton(
            key: const ValueKey('booking-send'),
            onPressed: _sending ? null : _book,
            child: _sending
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const KLocalizedText('পরামর্শের অনুরোধ পাঠান'),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/formatting/latin_digits_formatter.dart';
import '../../../core/formatting/money.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/permissions/permission_gateway.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../jobs/domain/job_models.dart';
import '../../jobs/presentation/widgets/review_dialog.dart';
import '../../trust_safety/presentation/trust_safety_providers.dart';
import '../community_routes.dart';
import '../data/community_repository.dart';
import '../domain/community_models.dart';
import 'community_providers.dart';
import 'community_widgets.dart';

/// Check-in failures past the session gate come back as generic codes with
/// job-worded English, so they get their own copy here.
const _checkInCodes = {
  'CONFLICT': 'এই সেশনে এখন চেক-ইন চালু নেই।',
  'BUSINESS_RULE_VIOLATION':
      'চেক-ইন হয়নি: আপনার অবস্থান সেশনের এলাকা থেকে দূরে, বা যথেষ্ট নির্ভুল নয়।',
};

const _womenOnlyCodes = {
  'WOMEN_ONLY':
      'এটি শুধু নারীদের সেশন। প্রোফাইলে লিঙ্গ নারী দেওয়া থাকলে যোগ দেওয়া যায়।',
};

/// A consultation, hosted session or group session: details and every
/// action the person may take in their role.
class SessionDetailScreen extends ConsumerStatefulWidget {
  const SessionDetailScreen({required this.sessionId, super.key});

  final String sessionId;

  @override
  ConsumerState<SessionDetailScreen> createState() =>
      _SessionDetailScreenState();
}

class _SessionDetailScreenState extends ConsumerState<SessionDetailScreen> {
  bool _busy = false;

  String get _id => widget.sessionId;

  void _refreshAll() {
    ref
      ..invalidate(sessionProvider(_id))
      ..invalidate(sessionsProvider)
      ..invalidate(groupSessionsProvider)
      ..invalidate(sessionFeedbackProvider(_id));
  }

  Future<void> _run(
    Future<Object?> Function() action,
    String done,
    String fallback, {
    Map<String, String> codes = const {},
  }) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      _refreshAll();
      if (mounted) showCommunitySnack(context, done);
    } on Object catch (error) {
      if (mounted) {
        showCommunityFailure(context, error, fallback, codes: codes);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  CommunityRepository get _repo => ref.read(communityRepositoryProvider);

  // ---- actions ----

  Future<void> _expertAccept(CommunitySession session) async {
    final answer = await showDialog<_ExpertAnswer>(
      context: context,
      builder: (_) => _ExpertAcceptDialog(
        needsLink:
            session.mode == SessionMode.online && session.onlineLink == null,
      ),
    );
    if (answer == null || !mounted) return;
    await _run(
      () => _repo.respondToSession(
        _id,
        accept: true,
        onlineLink: answer.link,
        priceModel: answer.priceModel,
        pricePoisha: answer.pricePoisha,
      ),
      'পরামর্শ নিশ্চিত করেছেন।',
      'নিশ্চিত করা যায়নি। আবার চেষ্টা করুন।',
    );
  }

  Future<void> _respond(bool accept, CommunitySession session) async {
    if (!accept) {
      final ok = await confirmAction(
        context,
        title: session.isConsultation
            ? 'পরামর্শটি নেবেন না?'
            : 'আমন্ত্রণ ফিরিয়ে দেবেন?',
        message: session.isConsultation
            ? 'পরামর্শটি বাতিল হবে এবং অনুরোধকারীকে জানানো হবে।'
            : 'আপনি এই সেশনে যাচ্ছেন না বলে জানানো হবে।',
        confirmLabel: 'না বলুন',
      );
      if (!ok || !mounted) return;
    }
    await _run(
      () => _repo.respondToSession(_id, accept: accept),
      accept ? 'আপনি যোগ দিচ্ছেন।' : 'জানিয়ে দেওয়া হয়েছে।',
      'উত্তর পাঠানো যায়নি। আবার চেষ্টা করুন।',
      codes: _womenOnlyCodes,
    );
  }

  Future<void> _leave(CommunitySession session) async {
    final ok = await confirmAction(
      context,
      title: session.isConsultation
          ? 'পরামর্শ বাতিল করবেন?'
          : 'সেশন থেকে সরে যাবেন?',
      message: session.isConsultation
          ? 'পরামর্শটি বাতিল হবে এবং বিশেষজ্ঞকে জানানো হবে।'
          : 'আপনার জায়গা অপেক্ষা তালিকার পরের জনকে দেওয়া হবে।',
      confirmLabel: session.isConsultation ? 'বাতিল করুন' : 'সরে যান',
    );
    if (!ok || !mounted) return;
    await _run(
      () => _repo.leaveSession(_id),
      session.isConsultation
          ? 'পরামর্শ বাতিল হয়েছে।'
          : 'আপনি সেশন থেকে সরে গেছেন।',
      'এটি করা যায়নি। আবার চেষ্টা করুন।',
    );
  }

  Future<void> _cancel() async {
    final reason = await askText(
      context,
      title: 'সেশন বাতিল করবেন?',
      label: 'কারণ (কমপক্ষে ৫ অক্ষর)',
      confirmLabel: 'বাতিল করুন',
      minLength: 5,
      maxLength: 500,
    );
    if (reason == null || !mounted) return;
    await _run(
      () => _repo.cancelSession(_id, reason),
      'সেশন বাতিল হয়েছে। সবাইকে জানানো হয়েছে।',
      'বাতিল করা যায়নি। আবার চেষ্টা করুন।',
    );
  }

  Future<void> _complete() async {
    final ok = await confirmAction(
      context,
      title: 'সেশন শেষ হয়েছে?',
      message:
          'শেষ করার পর উপস্থিত অংশগ্রহণকারীরা ৭ দিনের মধ্যে মতামত দিতে পারবেন।',
      confirmLabel: 'শেষ করুন',
    );
    if (!ok || !mounted) return;
    await _run(
      () => _repo.completeSession(_id),
      'সেশন শেষ হিসেবে চিহ্নিত হয়েছে।',
      'শেষ করা যায়নি। আবার চেষ্টা করুন।',
    );
  }

  Future<void> _invite(CommunitySession session) async {
    final userIds = await showPeoplePicker(
      context,
      exclude: {for (final person in session.participants) person.userId},
    );
    if (userIds == null || userIds.isEmpty || !mounted) return;
    await _run(
      () => _repo.inviteToSession(_id, userIds),
      session.status == 'DRAFT'
          ? 'আমন্ত্রণ যোগ হয়েছে। প্রকাশ করলে তাঁদের জানানো হবে।'
          : 'আমন্ত্রণ পাঠানো হয়েছে।',
      'আমন্ত্রণ পাঠানো যায়নি। আবার চেষ্টা করুন।',
    );
  }

  Future<void> _recordCash(SessionParticipant person) async {
    final text = await askText(
      context,
      title: 'নগদ টাকা লিখুন',
      label: 'কত টাকা পেয়েছেন',
      confirmLabel: 'সংরক্ষণ করুন',
      minLength: 1,
      maxLength: 9,
      keyboardType: TextInputType.number,
    );
    if (text == null || !mounted) return;
    final taka = int.tryParse(latinDigits(text));
    if (taka == null || taka < 0) {
      showCommunitySnack(context, 'সঠিক টাকার পরিমাণ লিখুন।');
      return;
    }
    await _run(
      () => _repo.recordCash(_id, person.userId, '${taka * 100}'),
      'নগদ টাকা লেখা হয়েছে।',
      'সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
    );
  }

  Future<void> _checkIn() async {
    final ok = await confirmAction(
      context,
      title: 'সেশনে চেক-ইন করবেন?',
      message:
          'চেক-ইনের জন্য একবার আপনার অবস্থান নেওয়া হবে। শুধু সেশনের এলাকা থেকে দূরত্ব রাখা হয়, আপনার অবস্থান নয়।',
      confirmLabel: 'চেক-ইন করুন',
    );
    if (!ok || !mounted) return;
    await _run(
      () async {
        final permission = await const PermissionGateway().request(
          KPermission.location,
        );
        if (permission != KPermissionStatus.granted) {
          throw const Failure(
            kind: FailureKind.forbidden,
            message: 'Location permission is needed.',
            code: 'LOCATION_PERMISSION',
          );
        }
        final location = await ref.read(locationGatewayProvider).current();
        return _repo.checkIn(_id, location);
      },
      'চেক-ইন সফল হয়েছে।',
      'চেক-ইন করা যায়নি। আবার চেষ্টা করুন।',
      codes: {
        ..._checkInCodes,
        'LOCATION_PERMISSION':
            'লোকেশন অনুমতি প্রয়োজন। সেটিংস থেকে অনুমতি দিয়ে আবার চেষ্টা করুন।',
      },
    );
  }

  Future<void> _openChat() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final conversationId = await _repo.sessionChat(_id);
      if (!mounted) return;
      if (conversationId == null) {
        showCommunitySnack(context, 'চ্যাট এখন খোলা যাচ্ছে না।');
      } else {
        await context.push(AppRoutes.chatThread(conversationId));
      }
    } on Object catch (error) {
      if (mounted) {
        showCommunityFailure(context, error, 'চ্যাট খোলা যায়নি।');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ---- build ----

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(sessionProvider(_id));
    final session = value.valueOrNull;
    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('সেশন'),
        actions: [
          if (session != null && !session.isHost)
            IconButton(
              key: const ValueKey('session-report'),
              tooltip: KaajLocalizations.text(context, 'রিপোর্ট করুন'),
              icon: const Icon(Icons.flag_outlined),
              onPressed: () => context.push(AppRoutes.report('SESSION', _id)),
            ),
        ],
      ),
      body: CommunityAsync<CommunitySession>(
        value: value,
        errorLabel: 'সেশনটি লোড করা যায়নি।',
        onRetry: () => ref.invalidate(sessionProvider(_id)),
        builder: (item) => RefreshIndicator(
          onRefresh: () async {
            _refreshAll();
            await ref
                .read(sessionProvider(_id).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: _body(context, item),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, CommunitySession s) {
    final theme = Theme.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final price = Money.tryParse(s.pricePoisha);
    final mine = s.myStatus;
    final isParticipant = s.myRole == 'PARTICIPANT';
    final canRsvp =
        s.groupId != null &&
        s.status == 'SCHEDULED' &&
        !s.isHost &&
        !{'ACCEPTED', 'WAITLISTED', 'ATTENDED', 'NO_SHOW'}.contains(mine);
    final invited = mine == 'INVITED' && s.isOpen;
    final canLeave =
        !s.isHost && s.isOpen && (mine == 'ACCEPTED' || mine == 'WAITLISTED');
    final hostActions = s.isHost && s.isOpen && !s.isConsultation;
    final now = DateTime.now();
    final canCheckIn =
        isParticipant &&
        mine == 'ACCEPTED' &&
        s.mode == SessionMode.inPerson &&
        s.status == 'SCHEDULED' &&
        s.startsAt != null &&
        now.isAfter(s.startsAt!.subtract(const Duration(hours: 1))) &&
        (s.endsAt == null || now.isBefore(s.endsAt!));
    final canChat = (s.isHost || s.confirmed) && s.status != 'CANCELLED';
    final people = s.participants
        .where((person) => person.role != 'HOST')
        .toList(growable: false);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        Text(s.title, style: theme.textTheme.titleLarge),
        const SizedBox(height: KSpacing.xs),
        Wrap(
          spacing: KSpacing.xs,
          runSpacing: KSpacing.xs,
          children: [
            StatusPill(sessionKindLabel(s.kind)),
            StatusPill(
              sessionStatusLabel(s.status),
              color: statusColor(s.status),
            ),
            if (!s.isHost && mine != null)
              StatusPill(
                participantStatusLabel(mine),
                color: statusColor(mine),
              ),
            if (s.womenOnly)
              const StatusPill('শুধু নারীদের', color: KColors.secondary),
            if (s.homeBasedFriendly) const StatusPill('ঘরে থেকে কাজের উপযোগী'),
          ],
        ),
        if (s.hiddenReason != null)
          Card(
            margin: const EdgeInsets.only(top: KSpacing.sm),
            child: ListTile(
              leading: const Icon(Icons.visibility_off_outlined),
              title: const KLocalizedText('KAAJ মডারেশন এই সেশনটি লুকিয়েছে'),
              subtitle: Text(s.hiddenReason!),
            ),
          ),
        const Divider(height: KSpacing.lg),
        if (s.startsAt != null)
          InfoRow(
            icon: Icons.schedule,
            label: 'সময়',
            value: [
              KFormat.dayAndTime(context, s.startsAt!),
              if (s.endsAt != null) KFormat.time(context, s.endsAt!),
            ].join(' – '),
          ),
        InfoRow(
          icon: switch (s.mode) {
            SessionMode.inPerson => Icons.location_on_outlined,
            SessionMode.online => Icons.videocam_outlined,
            SessionMode.inAppChat => Icons.chat_outlined,
          },
          label: 'কীভাবে',
          value: [
            KaajLocalizations.text(context, sessionModeLabel(s.mode)),
            if (s.mode == SessionMode.inPerson && s.area != null)
              s.area!.nameFor(language),
          ].join(' · '),
        ),
        if (s.onlineLink != null)
          Row(
            children: [
              Expanded(
                child: InfoRow(
                  icon: Icons.link,
                  label: 'অনলাইন লিঙ্ক',
                  value: s.onlineLink!,
                ),
              ),
              IconButton(
                tooltip: KaajLocalizations.text(context, 'লিঙ্ক কপি করুন'),
                icon: const Icon(Icons.copy),
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: s.onlineLink!));
                  if (context.mounted) {
                    showCommunitySnack(context, 'লিঙ্ক কপি হয়েছে।');
                  }
                },
              ),
            ],
          ),
        if (!s.isConsultation)
          InfoRow(
            icon: Icons.event_seat_outlined,
            label: 'জায়গা',
            value:
                '${KFormat.count(context, s.placesTaken)} / '
                '${KFormat.count(context, s.capacity)}',
          ),
        InfoRow(
          icon: Icons.payments_outlined,
          label: 'মূল্য',
          value: s.isCash && price != null
              ? '${KFormat.money(context, price)} · '
                    '${KaajLocalizations.text(context, 'সেখানেই নগদে')}'
              : KaajLocalizations.text(
                  context,
                  s.status == 'DRAFT' && s.isConsultation
                      ? 'বিশেষজ্ঞ নিশ্চিত করার সময় জানাবেন'
                      : 'বিনামূল্যে',
                ),
        ),
        InfoRow(
          icon: Icons.person_outline,
          label: s.isConsultation ? 'বিশেষজ্ঞ' : 'আয়োজক',
          value: s.isHost
              ? KaajLocalizations.text(context, 'আপনি')
              : s.host.displayName,
        ),
        if (s.isConsultation && s.isHost && s.requester != null)
          InfoRow(
            icon: Icons.person_search_outlined,
            label: 'অনুরোধকারী',
            value: s.requester!.displayName,
          ),
        if (mine == 'WAITLISTED' && s.waitlistPosition != null)
          InfoRow(
            icon: Icons.format_list_numbered,
            label: 'অপেক্ষা তালিকায় আপনার স্থান',
            value: KFormat.count(context, s.waitlistPosition!),
          ),
        if (s.myCheckedInAt != null)
          InfoRow(
            icon: Icons.where_to_vote_outlined,
            label: 'চেক-ইন করেছেন',
            value: KFormat.dateTime(context, s.myCheckedInAt!),
          ),
        if (s.cancelReason != null)
          InfoRow(
            icon: Icons.cancel_outlined,
            label: 'বাতিলের কারণ',
            value: s.cancelReason!,
          ),
        if (s.description != null)
          InfoRow(
            icon: Icons.notes,
            label: s.isConsultation ? 'নোট' : 'বিবরণ',
            value: s.description!,
          ),
        if (s.womenOnly)
          const Padding(
            padding: EdgeInsets.only(top: KSpacing.xs),
            child: KLocalizedText(
              'শুধু যাঁদের প্রোফাইলে লিঙ্গ নারী দেওয়া আছে তাঁরা যোগ দিতে পারেন; সার্ভার এটি যাচাই করে।',
            ),
          ),
        const SizedBox(height: KSpacing.md),

        // ---- my actions ----
        if (invited && s.isConsultation && s.isHost) ...[
          FilledButton(
            key: const ValueKey('session-expert-accept'),
            onPressed: _busy ? null : () => _expertAccept(s),
            child: const KLocalizedText('পরামর্শ নিশ্চিত করুন'),
          ),
          const SizedBox(height: KSpacing.sm),
          OutlinedButton(
            key: const ValueKey('session-decline'),
            onPressed: _busy ? null : () => _respond(false, s),
            child: const KLocalizedText('এবার পারছি না'),
          ),
          const SizedBox(height: KSpacing.sm),
        ] else if (invited) ...[
          FilledButton(
            key: const ValueKey('session-accept'),
            onPressed: _busy ? null : () => _respond(true, s),
            child: const KLocalizedText('যোগ দেব'),
          ),
          const SizedBox(height: KSpacing.sm),
          OutlinedButton(
            key: const ValueKey('session-decline'),
            onPressed: _busy ? null : () => _respond(false, s),
            child: const KLocalizedText('যাব না'),
          ),
          const SizedBox(height: KSpacing.sm),
        ],
        if (canRsvp && !invited) ...[
          FilledButton(
            key: const ValueKey('session-rsvp'),
            onPressed: _busy
                ? null
                : () => _run(
                    () => _repo.rsvp(_id),
                    'আপনার সাড়া নেওয়া হয়েছে।',
                    'যোগ দেওয়া যায়নি। আবার চেষ্টা করুন।',
                    codes: _womenOnlyCodes,
                  ),
            child: const KLocalizedText('আমি যাব'),
          ),
          const SizedBox(height: KSpacing.sm),
        ],
        if (canCheckIn) ...[
          FilledButton.icon(
            key: const ValueKey('session-checkin'),
            onPressed: _busy ? null : _checkIn,
            icon: const Icon(Icons.where_to_vote_outlined),
            label: const KLocalizedText('চেক-ইন করুন'),
          ),
          const SizedBox(height: KSpacing.sm),
        ],
        if (canChat) ...[
          FilledButton.tonalIcon(
            key: const ValueKey('session-chat'),
            onPressed: _busy ? null : _openChat,
            icon: const Icon(Icons.forum_outlined),
            label: const KLocalizedText('সেশনের চ্যাট'),
          ),
          const SizedBox(height: KSpacing.sm),
        ],
        if (canLeave) ...[
          OutlinedButton(
            key: const ValueKey('session-leave'),
            onPressed: _busy ? null : () => _leave(s),
            child: KLocalizedText(
              s.isConsultation ? 'পরামর্শ বাতিল করুন' : 'সরে যান',
            ),
          ),
          const SizedBox(height: KSpacing.sm),
        ],

        // ---- host actions ----
        if (s.isHost && s.status == 'DRAFT' && !s.isConsultation) ...[
          FilledButton(
            key: const ValueKey('session-publish'),
            onPressed: _busy
                ? null
                : () => _run(
                    () => _repo.publishSession(_id),
                    'সেশন প্রকাশিত হয়েছে।',
                    'প্রকাশ করা যায়নি। আবার চেষ্টা করুন।',
                  ),
            child: const KLocalizedText('প্রকাশ করুন'),
          ),
          const SizedBox(height: KSpacing.sm),
        ],
        if (hostActions)
          Wrap(
            spacing: KSpacing.sm,
            runSpacing: KSpacing.sm,
            children: [
              OutlinedButton.icon(
                key: const ValueKey('session-edit'),
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: _busy
                    ? null
                    : () => context.push(CommunityPaths.editSession(_id)),
                icon: const Icon(Icons.edit_outlined),
                label: const KLocalizedText('সম্পাদনা'),
              ),
              OutlinedButton.icon(
                key: const ValueKey('session-invite'),
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: _busy ? null : () => _invite(s),
                icon: const Icon(Icons.person_add_alt),
                label: const KLocalizedText('মানুষকে আমন্ত্রণ'),
              ),
            ],
          ),
        if (s.isHost && s.status == 'SCHEDULED' && s.hasStarted) ...[
          const SizedBox(height: KSpacing.sm),
          FilledButton(
            key: const ValueKey('session-complete'),
            onPressed: _busy ? null : _complete,
            child: const KLocalizedText('সেশন শেষ করুন'),
          ),
        ],
        if (s.isHost && s.isOpen) ...[
          const SizedBox(height: KSpacing.sm),
          TextButton(
            key: const ValueKey('session-cancel'),
            onPressed: _busy ? null : _cancel,
            child: const KLocalizedText('সেশন বাতিল করুন'),
          ),
        ],

        if (s.status == 'COMPLETED') _FeedbackSection(session: s),

        // ---- people ----
        if (people.isNotEmpty) ...[
          const Divider(height: KSpacing.lg),
          KLocalizedText(
            s.isHost ? 'অংশগ্রহণকারী' : 'যাঁরা যাচ্ছেন',
            style: theme.textTheme.titleMedium,
          ),
          for (final person in people) _personTile(context, s, person),
        ],
      ],
    );
  }

  Widget _personTile(
    BuildContext context,
    CommunitySession s,
    SessionParticipant person,
  ) {
    final cash = Money.tryParse(person.cashAmountPoisha);
    final canMark =
        s.isHost &&
        person.role == 'PARTICIPANT' &&
        (s.status == 'SCHEDULED' || s.status == 'COMPLETED') &&
        s.hasStarted &&
        {'ACCEPTED', 'ATTENDED', 'NO_SHOW'}.contains(person.status);
    final canCash = s.isHost && s.isCash && person.role == 'PARTICIPANT';
    return ListTile(
      key: ValueKey('participant-${person.userId}'),
      contentPadding: EdgeInsets.zero,
      leading: const CircleAvatar(child: Icon(Icons.person_outline)),
      title: Text(person.displayName),
      subtitle: Wrap(
        spacing: KSpacing.xs,
        children: [
          StatusPill(
            participantStatusLabel(person.status),
            color: statusColor(person.status),
          ),
          if (person.role == 'EXPERT') const StatusPill('বিশেষজ্ঞ'),
          if (cash != null) Text(KFormat.money(context, cash)),
        ],
      ),
      trailing: canMark || canCash
          ? PopupMenuButton<String>(
              key: ValueKey('participant-menu-${person.userId}'),
              enabled: !_busy,
              onSelected: (choice) {
                switch (choice) {
                  case 'ATTENDED' || 'NO_SHOW':
                    _run(
                      () => _repo.markAttendance(
                        _id,
                        person.userId,
                        attended: choice == 'ATTENDED',
                      ),
                      'উপস্থিতি লেখা হয়েছে।',
                      'উপস্থিতি লেখা যায়নি। আবার চেষ্টা করুন।',
                    );
                  case 'CASH':
                    _recordCash(person);
                }
              },
              itemBuilder: (context) => [
                if (canMark) ...[
                  PopupMenuItem(
                    value: 'ATTENDED',
                    child: KLocalizedText(participantStatusLabel('ATTENDED')),
                  ),
                  PopupMenuItem(
                    value: 'NO_SHOW',
                    child: KLocalizedText(participantStatusLabel('NO_SHOW')),
                  ),
                ],
                if (canCash)
                  const PopupMenuItem(
                    value: 'CASH',
                    child: KLocalizedText('নগদ টাকা লিখুন'),
                  ),
              ],
            )
          : null,
    );
  }
}

class _FeedbackSection extends ConsumerStatefulWidget {
  const _FeedbackSection({required this.session});

  final CommunitySession session;

  @override
  ConsumerState<_FeedbackSection> createState() => _FeedbackSectionState();
}

class _FeedbackSectionState extends ConsumerState<_FeedbackSection> {
  bool _sending = false;

  Future<void> _give() async {
    final input = await showDialog<ReviewInput>(
      context: context,
      builder: (_) => const ReviewDialog(),
    );
    if (input == null || !mounted) return;
    setState(() => _sending = true);
    try {
      await ref
          .read(communityRepositoryProvider)
          .sendSessionFeedback(widget.session.id, input.toJson());
      ref.invalidate(sessionFeedbackProvider(widget.session.id));
      if (mounted) showCommunitySnack(context, 'আপনার মতামত জমা হয়েছে।');
    } on Object catch (error) {
      if (mounted) {
        showCommunityFailure(context, error, 'মতামত জমা দেওয়া যায়নি।');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(sessionFeedbackProvider(widget.session.id));
    final theme = Theme.of(context);
    return state.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(KSpacing.md),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (_, _) => const SizedBox.shrink(),
      data: (feedback) {
        final children = <Widget>[];
        if (feedback.myRating != null) {
          children.add(
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.star_rounded, color: Colors.amber),
              title: const KLocalizedText('আপনি মতামত দিয়েছেন'),
              subtitle: Text(
                [
                  '★ ${KFormat.count(context, feedback.myRating!)} / '
                      '${KFormat.count(context, 5)}',
                  if (feedback.myComment != null) feedback.myComment!,
                ].join('\n'),
              ),
            ),
          );
        } else if (feedback.canReview) {
          children.add(
            FilledButton.icon(
              key: const ValueKey('session-feedback'),
              onPressed: _sending ? null : _give,
              icon: const Icon(Icons.star_outline_rounded),
              label: const KLocalizedText('মতামত দিন'),
            ),
          );
          if (feedback.windowEndsAt != null) {
            children.add(
              Padding(
                padding: const EdgeInsets.only(top: KSpacing.xs),
                child: Text(
                  '${KaajLocalizations.text(context, 'মতামতের শেষ সময়')}: '
                  '${KFormat.dateTime(context, feedback.windowEndsAt!)}',
                  style: theme.textTheme.bodySmall,
                ),
              ),
            );
          }
        }
        if (widget.session.isHost) {
          final received = feedback.received;
          children.add(
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.reviews_outlined),
              title: const KLocalizedText('অংশগ্রহণকারীদের মতামত'),
              subtitle: received.isEmpty
                  ? const KLocalizedText('এখনো কেউ মতামত দেননি।')
                  : Text(
                      '★ ${(received.map((item) => item.rating).reduce((a, b) => a + b) / received.length).toStringAsFixed(1)}'
                      ' · ${KFormat.count(context, received.length)}',
                    ),
            ),
          );
          for (final item in received) {
            if (item.comment != null) {
              children.add(Text('“${item.comment!}”'));
            }
          }
        }
        if (children.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(top: KSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: children,
          ),
        );
      },
    );
  }
}

class _ExpertAnswer {
  const _ExpertAnswer({required this.priceModel, this.link, this.pricePoisha});

  final String? link;
  final String priceModel;
  final String? pricePoisha;
}

/// The expert confirms a consultation: the online link when needed and
/// whether it is free or paid in cash on the spot.
class _ExpertAcceptDialog extends StatefulWidget {
  const _ExpertAcceptDialog({required this.needsLink});

  final bool needsLink;

  @override
  State<_ExpertAcceptDialog> createState() => _ExpertAcceptDialogState();
}

class _ExpertAcceptDialogState extends State<_ExpertAcceptDialog> {
  final _link = TextEditingController();
  final _amount = TextEditingController();
  String _price = 'FREE';

  @override
  void dispose() {
    _link.dispose();
    _amount.dispose();
    super.dispose();
  }

  int? get _taka => int.tryParse(latinDigits(_amount.text.trim()));

  bool get _ok {
    if (widget.needsLink) {
      final uri = Uri.tryParse(_link.text.trim());
      if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
        return false;
      }
    }
    return _price == 'FREE' || (_taka ?? 0) > 0;
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const KLocalizedText('পরামর্শ নিশ্চিত করুন'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.needsLink)
            TextField(
              key: const ValueKey('expert-link'),
              controller: _link,
              keyboardType: TextInputType.url,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: KaajLocalizations.text(
                  context,
                  'অনলাইন লিঙ্ক (https://…)',
                ),
              ),
            ),
          const SizedBox(height: KSpacing.sm),
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
            TextField(
              key: const ValueKey('expert-amount'),
              controller: _amount,
              keyboardType: TextInputType.number,
              inputFormatters: const [LatinDigitsFormatter()],
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: KaajLocalizations.text(
                  context,
                  'কত টাকা (সেখানেই নগদে)',
                ),
              ),
            ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const KLocalizedText('ফিরে যান'),
      ),
      FilledButton(
        key: const ValueKey('expert-confirm'),
        onPressed: _ok
            ? () => Navigator.pop(
                context,
                _ExpertAnswer(
                  link: widget.needsLink ? _link.text.trim() : null,
                  priceModel: _price,
                  pricePoisha: _price == 'CASH' ? '${_taka! * 100}' : null,
                ),
              )
            : null,
        child: const KLocalizedText('নিশ্চিত করুন'),
      ),
    ],
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../ai/presentation/ai_common.dart';
import '../../ai/presentation/ai_providers.dart';
import '../../profile/presentation/controllers/me_provider.dart';
import '../domain/idea_models.dart';
import '../idea_routes.dart';
import 'idea_providers.dart';
import 'idea_widgets.dart';

/// `/ideas/:id`: the card for everyone; the private details with the
/// confidentiality notice for the team and approved people; a request for
/// access for others; roles; the owner tools.
class IdeaDetailScreen extends ConsumerWidget {
  const IdeaDetailScreen({required this.ideaId, super.key});

  final String ideaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(ideaDetailProvider(ideaId));
    final idea = detail.valueOrNull;
    Future<void> refresh() async {
      ref.invalidate(ideaDetailProvider(ideaId));
      await ref
          .read(ideaDetailProvider(ideaId).future)
          .then<void>((_) {}, onError: (_) {});
    }

    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('আইডিয়া'),
        actions: [
          if (idea != null && idea.isOwner)
            IconButton(
              key: const ValueKey('idea-edit'),
              tooltip: KaajLocalizations.text(context, 'আইডিয়া সম্পাদনা'),
              icon: const Icon(Icons.edit_outlined),
              onPressed: () => openIdeaEditor(context, ideaId),
            ),
          if (idea != null && !idea.isOwner)
            IconButton(
              key: const ValueKey('idea-report'),
              tooltip: KaajLocalizations.text(
                context,
                'আইডিয়াটি রিপোর্ট করুন',
              ),
              icon: const Icon(Icons.flag_outlined),
              onPressed: () => context.push(AppRoutes.report('IDEA', ideaId)),
            ),
        ],
      ),
      body: detail.when(
        skipLoadingOnRefresh: true,
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => RefreshIndicator(
          onRefresh: refresh,
          child: IdeaLoadError(
            error: error,
            onRetry: () => ref.invalidate(ideaDetailProvider(ideaId)),
          ),
        ),
        data: (idea) => RefreshIndicator(
          onRefresh: refresh,
          child: _IdeaBody(idea: idea),
        ),
      ),
    );
  }
}

/// Opens the editor; leaves the detail when the idea was deleted there.
Future<void> openIdeaEditor(BuildContext context, String ideaId) async {
  final deleted = await context.push<bool>(IdeaPaths.edit(ideaId));
  if (deleted != true || !context.mounted) return;
  if (context.canPop()) {
    context.pop();
  } else {
    context.go(IdeaPaths.mine);
  }
}

class _IdeaBody extends ConsumerStatefulWidget {
  const _IdeaBody({required this.idea});

  final Idea idea;

  @override
  ConsumerState<_IdeaBody> createState() => _IdeaBodyState();
}

class _IdeaBodyState extends ConsumerState<_IdeaBody> {
  bool _roomBusy = false;
  bool _leaving = false;

  Idea get idea => widget.idea;

  Future<void> _openRoom() async {
    if (_roomBusy) return;
    setState(() => _roomBusy = true);
    try {
      final conversationId = await ref
          .read(ideaRepositoryProvider)
          .room(idea.id);
      if (!mounted) return;
      if (conversationId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: KLocalizedText(
              'দলের আলাপ এখন খোলা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।',
            ),
          ),
        );
      } else {
        await context.push(AppRoutes.chatThread(conversationId));
      }
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, 'দলের আলাপ খোলা যায়নি।');
    } finally {
      if (mounted) setState(() => _roomBusy = false);
    }
  }

  Future<void> _leave() async {
    if (_leaving) return;
    final String userId;
    try {
      userId = (await ref.read(meProvider.future)).userId;
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, 'দল ছাড়া যায়নি।');
      return;
    }
    if (!mounted) return;
    final confirmed = await confirmIdeaAction(
      context,
      title: 'দল ছেড়ে দেবেন?',
      message:
          'আপনি আর বিস্তারিত দেখতে বা দলের আলাপে থাকতে পারবেন না। আবার যোগ দিতে মালিককে নতুন করে রাজি হতে হবে।',
      confirmLabel: 'দল ছেড়ে দিন',
    );
    if (!confirmed || !mounted) return;
    setState(() => _leaving = true);
    try {
      await ref.read(ideaRepositoryProvider).removeMember(idea.id, userId);
      ref
        ..invalidate(myIdeasProvider)
        ..invalidate(ideaDetailProvider(idea.id));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: KLocalizedText('আপনি দল ছেড়ে দিয়েছেন।')),
        );
      }
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, 'দল ছাড়া যায়নি।');
    } finally {
      if (mounted) setState(() => _leaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final details = idea.details;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        Text(idea.title, style: theme.textTheme.headlineSmall),
        const SizedBox(height: KSpacing.xs),
        Wrap(
          spacing: KSpacing.xs,
          runSpacing: KSpacing.xs,
          children: [
            Chip(label: Text(ideaStageText(context, idea))),
            if (idea.category case final sector?)
              Chip(label: Text(sector.nameFor(language))),
            if (idea.area case final area?)
              Chip(
                avatar: const Icon(Icons.place_outlined, size: 16),
                label: Text(area.nameFor(language)),
              ),
            if (idea.isOwner)
              IdeaBadge(label: ideaVisibilityLabel(idea.visibility)),
          ],
        ),
        const SizedBox(height: KSpacing.sm),
        IdeaOwnerLine(owner: idea.owner),
        Text(
          ideaLabelled(
            context,
            'দলের আকার',
            KFormat.count(context, idea.teamSize),
          ),
          style: theme.textTheme.bodySmall,
        ),
        if (idea.isOwner && idea.isHidden)
          Card(
            key: const ValueKey('idea-hidden'),
            color: KColors.danger.withValues(alpha: .12),
            child: ListTile(
              leading: const Icon(Icons.visibility_off_outlined),
              title: const KLocalizedText(
                'মডারেটর আইডিয়াটি লুকিয়ে রেখেছেন। অন্য কেউ এটি দেখতে পাচ্ছেন না।',
              ),
              subtitle: idea.hiddenReason == null
                  ? null
                  : Text(
                      ideaLabelled(context, 'লুকানোর কারণ', idea.hiddenReason!),
                    ),
            ),
          ),
        if (idea.isConverted)
          Card(
            key: const ValueKey('idea-converted'),
            child: ListTile(
              leading: const Icon(Icons.storefront_outlined),
              title: const KLocalizedText('আইডিয়াটি এখন একটি ব্যবসা।'),
              trailing: idea.convertedBusinessId == null
                  ? null
                  : TextButton(
                      key: const ValueKey('idea-open-business'),
                      onPressed: () => context.push(
                        IdeaPaths.business(idea.convertedBusinessId!),
                      ),
                      child: const KLocalizedText('নতুন ব্যবসাটি দেখুন'),
                    ),
            ),
          ),
        IdeaSection(title: 'আইডিয়ার সারাংশ', children: [Text(idea.summary)]),
        if (idea.canViewDetails && details != null) ...[
          if (idea.notice case final notice?)
            Padding(
              padding: const EdgeInsets.only(top: KSpacing.md),
              child: IdeaNoticeCard(
                key: const ValueKey('idea-notice'),
                notice: notice,
              ),
            ),
          IdeaSection(
            title: 'কোন সমস্যার সমাধান করবে',
            children: [Text(details.problem)],
          ),
          IdeaSection(
            title: 'আপনার সমাধান',
            children: [Text(details.solution)],
          ),
          if (details.details case final more?)
            IdeaSection(title: 'আরও বিস্তারিত', children: [Text(more)]),
        ] else
          _AccessCard(idea: idea),
        IdeaSection(
          title: 'যে ভূমিকার মানুষ দরকার',
          trailing: idea.isOwner
              ? TextButton.icon(
                  key: const ValueKey('idea-add-role'),
                  onPressed: () => context.push(IdeaPaths.newRole(idea.id)),
                  icon: const Icon(Icons.add),
                  label: const KLocalizedText('ভূমিকা যোগ করুন'),
                )
              : null,
          children: [
            if (idea.roles.isEmpty)
              KLocalizedText(
                idea.isOwner
                    ? 'এখনো কোনো ভূমিকা নেই। কাদের দরকার তা যোগ করলে KAAJ মানানসই মানুষ দেখাবে।'
                    : 'মালিক এখনো কোনো খোলা ভূমিকা দেননি।',
                style: const TextStyle(color: KColors.textSecondary),
              ),
            for (final role in idea.roles) _RoleCard(idea: idea, role: role),
            if (!idea.isTeam)
              Padding(
                padding: const EdgeInsets.only(top: KSpacing.sm),
                child: OutlinedButton.icon(
                  key: const ValueKey('idea-interest-general'),
                  onPressed: () => showIdeaInterestDialog(context, idea),
                  icon: const Icon(Icons.handshake_outlined),
                  label: const KLocalizedText('এই আইডিয়ায় যুক্ত হতে চাই'),
                ),
              ),
          ],
        ),
        if (idea.isTeam)
          IdeaSection(
            title: 'আইডিয়ার দল',
            children: [
              ListTile(
                key: const ValueKey('idea-room'),
                contentPadding: EdgeInsets.zero,
                leading: _roomBusy
                    ? const SizedBox.square(
                        dimension: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.forum_outlined),
                title: const KLocalizedText('দলের আলাপ খুলুন'),
                onTap: _roomBusy ? null : _openRoom,
              ),
              ListTile(
                key: const ValueKey('idea-tool-team'),
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.groups_outlined),
                title: const KLocalizedText('আইডিয়ার দলের সদস্যরা'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push(IdeaPaths.team(idea.id)),
              ),
              if (idea.isMember)
                ListTile(
                  key: const ValueKey('idea-leave'),
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.logout, color: KColors.danger),
                  title: const KLocalizedText('দল ছেড়ে দিন'),
                  enabled: !_leaving,
                  onTap: _leave,
                ),
            ],
          ),
        if (idea.isOwner)
          IdeaSection(
            title: 'মালিকের কাজ',
            children: [
              ListTile(
                key: const ValueKey('idea-tool-access'),
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.key_outlined),
                title: const KLocalizedText('দেখার অনুরোধ ও অনুমতি'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push(IdeaPaths.access(idea.id)),
              ),
              // Shown only while KAAJ AI is on.
              if (ref.watch(aiStatusProvider).valueOrNull?.enabled ?? false)
                ListTile(
                  key: const ValueKey('idea-tool-ai'),
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.auto_awesome_outlined),
                  title: const KLocalizedText('AI বিশ্লেষণ'),
                  subtitle: const KLocalizedText('শুধু গ্রাহকদের জন্য'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push(AiPaths.ideaAnalysis(idea.id)),
                ),
              ListTile(
                key: const ValueKey('idea-tool-views'),
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.visibility_outlined),
                title: const KLocalizedText('কে কখন বিস্তারিত দেখেছেন'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push(IdeaPaths.views(idea.id)),
              ),
              if (!idea.isConverted)
                ListTile(
                  key: const ValueKey('idea-tool-convert'),
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.storefront_outlined),
                  title: const KLocalizedText('ব্যবসায় রূপ দিন'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push(IdeaPaths.convert(idea.id)),
                ),
              ListTile(
                key: const ValueKey('idea-tool-edit'),
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.edit_outlined),
                title: const KLocalizedText('আইডিয়া সম্পাদনা'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => openIdeaEditor(context, idea.id),
              ),
            ],
          ),
        const SizedBox(height: KSpacing.xl),
      ],
    );
  }
}

/// For people outside the team: why the details are hidden and the
/// request for access.
class _AccessCard extends StatelessWidget {
  const _AccessCard({required this.idea});

  final Idea idea;

  @override
  Widget build(BuildContext context) {
    final status = idea.myAccess?.status;
    final canAsk =
        status == null || status == 'DECLINED' || status == 'REVOKED';
    final message = switch (status) {
      'REQUESTED' =>
        'আপনার অনুরোধ মালিকের কাছে আছে। অনুমতি দিলে এখানেই বিস্তারিত দেখবেন।',
      'APPROVED' =>
        'মালিক এখন আইডিয়াটি শুধু দলের জন্য রেখেছেন, তাই আপনার অনুমতি স্থগিত আছে।',
      'DECLINED' =>
        'মালিক আগের অনুরোধটি গ্রহণ করেননি। চাইলে আবার অনুরোধ করতে পারেন।',
      'REVOKED' =>
        'মালিক আপনার অনুমতি তুলে নিয়েছেন। চাইলে আবার অনুরোধ করতে পারেন।',
      _ =>
        'সমস্যা, সমাধান ও বিস্তারিত গোপন। মালিক অনুমতি দিলে দেখতে পাবেন; আপনি কখন দেখেছেন তা মালিকের কাছে লেখা থাকবে।',
    };
    return Card(
      key: const ValueKey('idea-access-card'),
      margin: const EdgeInsets.only(top: KSpacing.md),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.lock_outline),
                const SizedBox(width: KSpacing.sm),
                Expanded(
                  child: KLocalizedText(
                    'গোপন বিস্তারিত',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            if (status != null)
              Align(
                alignment: Alignment.centerLeft,
                child: IdeaBadge(
                  key: const ValueKey('idea-my-access'),
                  label: ideaAccessStatusLabel(status),
                ),
              ),
            const SizedBox(height: KSpacing.sm),
            KLocalizedText(message),
            if (canAsk) ...[
              const SizedBox(height: KSpacing.sm),
              FilledButton.icon(
                key: const ValueKey('idea-request-access'),
                onPressed: () => showIdeaAccessDialog(context, idea.id),
                icon: const Icon(Icons.key_outlined),
                label: const KLocalizedText('বিস্তারিত দেখার অনুরোধ করুন'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({required this.idea, required this.role});

  final Idea idea;
  final IdeaRole role;

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final theme = Theme.of(context);
    return Card(
      key: ValueKey('idea-role-${role.id}'),
      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    ideaRoleText(context, role),
                    style: theme.textTheme.titleSmall,
                  ),
                ),
                if (idea.isTeam || !role.isOpen)
                  IdeaBadge(label: ideaRoleStatusLabel(role.status)),
                if (!idea.isOwner)
                  IconButton(
                    key: ValueKey('idea-report-role-${role.id}'),
                    tooltip: KaajLocalizations.text(
                      context,
                      'ভূমিকাটি রিপোর্ট করুন',
                    ),
                    icon: const Icon(Icons.flag_outlined, size: 20),
                    onPressed: () =>
                        context.push(AppRoutes.report('IDEA_ROLE', role.id)),
                  ),
              ],
            ),
            if (role.title case final title?) Text(title),
            if (role.description case final description?)
              Text(description, style: theme.textTheme.bodySmall),
            const SizedBox(height: KSpacing.xs),
            Text(
              [
                KaajLocalizations.text(
                  context,
                  ideaTimeLabel(role.timeCommitment),
                ),
                KaajLocalizations.text(
                  context,
                  ideaArrangementLabel(role.arrangement),
                ),
              ].join(' · '),
              style: theme.textTheme.bodySmall,
            ),
            if (role.skills.isNotEmpty)
              Wrap(
                spacing: KSpacing.xs,
                children: [
                  for (final skill in role.skills)
                    Chip(
                      visualDensity: VisualDensity.compact,
                      label: Text(skill.nameFor(language)),
                    ),
                ],
              ),
            if (idea.isOwner)
              Wrap(
                spacing: KSpacing.sm,
                children: [
                  TextButton.icon(
                    key: ValueKey('idea-matches-${role.id}'),
                    onPressed: () =>
                        context.push(IdeaPaths.matches(idea.id, role.id)),
                    icon: const Icon(Icons.people_alt_outlined),
                    label: const KLocalizedText('মানানসই মানুষ'),
                  ),
                  TextButton.icon(
                    key: ValueKey('idea-edit-role-${role.id}'),
                    onPressed: () =>
                        context.push(IdeaPaths.editRole(idea.id, role.id)),
                    icon: const Icon(Icons.edit_outlined),
                    label: const KLocalizedText('ভূমিকা বদলান'),
                  ),
                ],
              )
            else if (!idea.isTeam && role.isOpen)
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  key: ValueKey('idea-interest-${role.id}'),
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                  onPressed: () =>
                      showIdeaInterestDialog(context, idea, role: role),
                  icon: const Icon(Icons.waving_hand_outlined),
                  label: const KLocalizedText('এই ভূমিকায় আমি আগ্রহী'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Asks the owner for the private details. The confidentiality box must
/// be ticked before it can be sent.
Future<void> showIdeaAccessDialog(BuildContext context, String ideaId) async {
  final sent = await showDialog<bool>(
    context: context,
    builder: (_) => _AccessDialog(ideaId: ideaId),
  );
  if (sent == true && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: KLocalizedText('অনুরোধ মালিকের কাছে পাঠানো হয়েছে।'),
      ),
    );
  }
}

class _AccessDialog extends ConsumerStatefulWidget {
  const _AccessDialog({required this.ideaId});

  final String ideaId;

  @override
  ConsumerState<_AccessDialog> createState() => _AccessDialogState();
}

class _AccessDialogState extends ConsumerState<_AccessDialog> {
  final _message = TextEditingController();
  bool _accepted = false;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_sending || !_accepted) return;
    if (_message.text.trim().length > 500) {
      setState(
        () => _error = KaajLocalizations.text(
          context,
          'বার্তা সর্বোচ্চ ৫০০ অক্ষরের হতে পারে।',
        ),
      );
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref
          .read(ideaRepositoryProvider)
          .requestAccess(widget.ideaId, message: _message.text);
      ref
        ..invalidate(ideaDetailProvider(widget.ideaId))
        ..invalidate(myIdeaAccessProvider);
      if (mounted) Navigator.pop(context, true);
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _error = failureText(
            context,
            error,
            'অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const KLocalizedText('বিস্তারিত দেখার অনুরোধ'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const KLocalizedText(
            'মালিক রাজি হলে সমস্যা, সমাধান ও বিস্তারিত দেখতে পাবেন। প্রতিবার দেখা মালিকের কাছে লেখা থাকবে।',
          ),
          CheckboxListTile(
            key: const ValueKey('idea-accept-confidentiality'),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _accepted,
            onChanged: (value) => setState(() => _accepted = value ?? false),
            title: const KLocalizedText(
              'আমি এই আইডিয়ার বিস্তারিত গোপন রাখব। মালিকের অনুমতি ছাড়া কাউকে জানাব না বা নিজে ব্যবহার করব না।',
            ),
          ),
          TextField(
            key: const ValueKey('idea-access-message'),
            controller: _message,
            maxLines: 3,
            maxLength: 500,
            decoration: InputDecoration(
              labelText: KaajLocalizations.text(
                context,
                'মালিকের জন্য বার্তা (ঐচ্ছিক)',
              ),
            ),
          ),
          if (_error case final error?)
            Text(
              error,
              key: const ValueKey('idea-access-error'),
              style: const TextStyle(color: KColors.danger),
            ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: _sending ? null : () => Navigator.pop(context, false),
        child: const KLocalizedText('বাতিল'),
      ),
      FilledButton(
        key: const ValueKey('idea-access-send'),
        style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
        onPressed: _accepted && !_sending ? _send : null,
        child: _sending
            ? const SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const KLocalizedText('অনুরোধ পাঠান'),
      ),
    ],
  );
}

/// Interest in the idea, or in one of its roles: a collaboration request
/// to the owner. It does not open the private details.
Future<void> showIdeaInterestDialog(
  BuildContext context,
  Idea idea, {
  IdeaRole? role,
}) async {
  final sent = await showDialog<IdeaCollaboration>(
    context: context,
    builder: (_) => _InterestDialog(idea: idea, role: role),
  );
  if (sent == null || !context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: const KLocalizedText('আপনার আগ্রহ মালিকের কাছে পাঠানো হয়েছে।'),
      action: sent.id.isEmpty
          ? null
          : SnackBarAction(
              label: KaajLocalizations.text(context, 'সহযোগিতার অনুরোধ দেখুন'),
              onPressed: () => context.push(IdeaPaths.collaboration(sent.id)),
            ),
    ),
  );
}

class _InterestDialog extends ConsumerStatefulWidget {
  const _InterestDialog({required this.idea, this.role});

  final Idea idea;
  final IdeaRole? role;

  @override
  ConsumerState<_InterestDialog> createState() => _InterestDialogState();
}

class _InterestDialogState extends ConsumerState<_InterestDialog> {
  final _message = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_sending) return;
    final length = _message.text.trim().length;
    if (length < 10 || length > 1000) {
      setState(
        () => _error = KaajLocalizations.text(
          context,
          'বার্তা ১০ থেকে ১০০০ অক্ষরের হতে হবে।',
        ),
      );
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final sent = await ref
          .read(ideaRepositoryProvider)
          .sendInterest(
            widget.idea.id,
            roleId: widget.role?.id,
            message: _message.text,
          );
      if (mounted) Navigator.pop(context, sent);
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _error = failureText(
            context,
            error,
            'আগ্রহ পাঠানো যায়নি। আবার চেষ্টা করুন।',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = widget.role;
    return AlertDialog(
      title: Text(
        role == null
            ? KaajLocalizations.text(context, 'এই আইডিয়ায় যুক্ত হতে চাই')
            : ideaLabelled(
                context,
                'যে ভূমিকায় আগ্রহ',
                ideaRoleText(context, role),
              ),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const IdeaStaticNotice(
              key: ValueKey('idea-collaboration-notice'),
              text:
                  'KAAJ-এর সহযোগিতা কোনো আইনি অংশীদারি বা চুক্তি নয়। টাকা, অংশ বা দায়িত্ব নিয়ে কিছু ঠিক করলে লিখিত চুক্তি করুন।',
            ),
            const KLocalizedText(
              'আগ্রহ জানালে মালিক আপনার বার্তা পাবেন। এতে আইডিয়ার গোপন বিস্তারিত দেখার অনুমতি পাওয়া যায় না।',
            ),
            const SizedBox(height: KSpacing.sm),
            TextField(
              key: const ValueKey('idea-interest-message'),
              controller: _message,
              minLines: 3,
              maxLines: 6,
              maxLength: 1000,
              decoration: InputDecoration(
                labelText: KaajLocalizations.text(
                  context,
                  'নিজের সম্পর্কে ও কীভাবে সাহায্য করবেন',
                ),
              ),
            ),
            if (_error case final error?)
              Text(
                error,
                key: const ValueKey('idea-interest-error'),
                style: const TextStyle(color: KColors.danger),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _sending ? null : () => Navigator.pop(context),
          child: const KLocalizedText('বাতিল'),
        ),
        FilledButton(
          key: const ValueKey('idea-interest-send'),
          style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
          onPressed: _sending ? null : _send,
          child: _sending
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const KLocalizedText('আগ্রহ পাঠান'),
        ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../../core/widgets/k_text_field.dart';
import '../../../core/widgets/load_more.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import '../business_routes.dart';
import '../domain/business_models.dart';
import 'business_providers.dart';
import 'business_widgets.dart';

String _subjectTypeLabel(CollaborationSubject subject) =>
    subject.isIdea ? 'আইডিয়া' : 'ব্যবসা';

String _actionLabel(CollaborationAction action) => switch (action) {
  CollaborationAction.accept => 'গ্রহণ করুন',
  CollaborationAction.decline => 'ফিরিয়ে দিন',
  CollaborationAction.withdraw => 'প্রত্যাহার করুন',
  CollaborationAction.agree => 'নীতিগতভাবে সম্মতি দিন',
  CollaborationAction.end => 'সহযোগিতা শেষ করুন',
};

String _historyBy(String by) => switch (by) {
  'ME' => 'আপনি',
  'THEM' => 'অন্য পক্ষ',
  'KAAJ' => 'KAAJ',
  _ => 'অজানা',
};

void _invalidateCollaborations(WidgetRef ref, String id) {
  ref
    ..invalidate(collaborationDetailProvider(id))
    ..invalidate(collaborationsProvider('received'))
    ..invalidate(collaborationsProvider('sent'));
}

// --------------------------------------------------------------------- list

/// Collaboration requests the person received and sent.
class CollaborationListScreen extends StatelessWidget {
  const CollaborationListScreen({super.key});

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 2,
    child: Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('সহযোগিতার অনুরোধ'),
        bottom: const TabBar(
          tabs: [
            Tab(
              key: ValueKey('collaboration-tab-received'),
              child: KLocalizedText('পাওয়া'),
            ),
            Tab(
              key: ValueKey('collaboration-tab-sent'),
              child: KLocalizedText('পাঠানো'),
            ),
          ],
        ),
      ),
      body: const TabBarView(
        children: [
          _CollaborationBox(box: 'received'),
          _CollaborationBox(box: 'sent'),
        ],
      ),
    ),
  );
}

class _CollaborationBox extends ConsumerStatefulWidget {
  const _CollaborationBox({required this.box});

  final String box;

  @override
  ConsumerState<_CollaborationBox> createState() => _CollaborationBoxState();
}

class _CollaborationBoxState extends ConsumerState<_CollaborationBox> {
  final _more = MorePages<Collaboration>();

  @override
  Widget build(BuildContext context) {
    final box = widget.box;
    final page = ref.watch(collaborationsProvider(box));
    return page.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ListView(
        children: [
          const Padding(
            padding: EdgeInsets.all(KSpacing.md),
            child: CollaborationNoticeCard(notice: BnEn()),
          ),
          SizedBox(
            height: 320,
            child: BusinessLoadError(
              error: error,
              label: 'অনুরোধের তালিকা লোড করা যায়নি।',
              onRetry: () => ref.invalidate(collaborationsProvider(box)),
            ),
          ),
        ],
      ),
      data: (first) {
        final items = _more.merge(first.items);
        final hasMore = _more.hasMore;
        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(collaborationsProvider(box));
            await ref
                .read(collaborationsProvider(box).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(KSpacing.md),
            children: [
              CollaborationNoticeCard(notice: first.notice),
              if (items.isEmpty)
                KEmptyState(
                  icon: Icons.handshake_outlined,
                  title: box == 'received'
                      ? 'কোনো অনুরোধ আসেনি'
                      : 'আপনি কোনো অনুরোধ পাঠাননি',
                  message:
                      'অংশীদার তালিকা থেকে কোনো ব্যবসায় সহযোগিতার অনুরোধ পাঠাতে পারেন।',
                  actionLabel: 'অংশীদার খুঁজুন',
                  onAction: () => context.push(BusinessRoutes.partners),
                ),
              for (final item in items)
                _CollaborationCard(
                  request: item,
                  onTap: () async {
                    await context.push(BusinessRoutes.collaboration(item.id));
                    ref.invalidate(collaborationsProvider(box));
                  },
                ),
              if (hasMore)
                LoadMoreButton(
                  key: ValueKey('collaboration-load-more-$box'),
                  loading: _more.loading,
                  failed: _more.failed,
                  onPressed: () => _more.loadNext(
                    (cursor) async =>
                        (await ref
                                .read(businessRepositoryProvider)
                                .collaborations(box, cursor: cursor))
                            .items,
                    () {
                      if (mounted) setState(() {});
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _CollaborationCard extends StatelessWidget {
  const _CollaborationCard({required this.request, required this.onTap});

  final Collaboration request;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final other = request.otherSide.displayName;
    return Card(
      key: ValueKey('collaboration-${request.id}'),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(KSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      request.subject.title ??
                          KaajLocalizations.text(
                            context,
                            _subjectTypeLabel(request.subject),
                          ),
                      style: theme.textTheme.titleMedium,
                    ),
                  ),
                  BusinessPill(
                    collaborationStatusLabel(request.status),
                    color: collaborationStatusColor(request.status),
                  ),
                ],
              ),
              const SizedBox(height: KSpacing.xs),
              Text(
                [
                  KaajLocalizations.text(
                    context,
                    _subjectTypeLabel(request.subject),
                  ),
                  if (other.isNotEmpty) other,
                  if (request.createdAt != null)
                    KFormat.date(context, request.createdAt!),
                ].join(' · '),
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: KSpacing.xs),
              Text(
                request.message,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------- detail

/// One collaboration request. Also opened from Ideas (subject IDEA).
class CollaborationDetailScreen extends ConsumerWidget {
  const CollaborationDetailScreen({required this.requestId, super.key});

  final String requestId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final request = ref.watch(collaborationDetailProvider(requestId));
    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('সহযোগিতার অনুরোধ'),
        actions: [
          if (request.hasValue)
            IconButton(
              key: const ValueKey('collaboration-report'),
              tooltip: KaajLocalizations.text(context, 'রিপোর্ট করুন'),
              onPressed: () => context.push(
                AppRoutes.report('COLLABORATION_REQUEST', requestId),
              ),
              icon: const Icon(Icons.flag_outlined),
            ),
        ],
      ),
      body: request.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ListView(
          children: [
            const Padding(
              padding: EdgeInsets.all(KSpacing.md),
              child: CollaborationNoticeCard(notice: BnEn()),
            ),
            SizedBox(
              height: 360,
              child: BusinessLoadError(
                error: error,
                label: 'অনুরোধটি লোড করা যায়নি।',
                onRetry: () =>
                    ref.invalidate(collaborationDetailProvider(requestId)),
              ),
            ),
          ],
        ),
        data: (request) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(collaborationDetailProvider(requestId));
            await ref
                .read(collaborationDetailProvider(requestId).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: _CollaborationBody(request: request),
        ),
      ),
    );
  }
}

class _CollaborationBody extends ConsumerWidget {
  const _CollaborationBody({required this.request});

  final Collaboration request;

  Future<void> _act(
    BuildContext context,
    WidgetRef ref,
    CollaborationAction action,
  ) async {
    final done = await showDialog<bool>(
      context: context,
      builder: (_) => _ActionDialog(request: request, action: action),
    );
    if (done == true) _invalidateCollaborations(ref, request.id);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final subject = request.subject;
    final other = request.otherSide;
    final agreement = request.agreement;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        CollaborationNoticeCard(notice: request.notice),
        Card(
          key: const ValueKey('collaboration-subject'),
          child: ListTile(
            leading: Icon(
              subject.isIdea
                  ? Icons.lightbulb_outline
                  : Icons.storefront_outlined,
            ),
            title: Text(
              subject.title ??
                  KaajLocalizations.text(context, _subjectTypeLabel(subject)),
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                KLocalizedText(_subjectTypeLabel(subject)),
                if (subject.summary != null) Text(subject.summary!),
                if (subject.isIdea && subject.ideaRoleId != null)
                  const KLocalizedText(
                    'আইডিয়ার একটি নির্দিষ্ট ভূমিকা নিয়ে আগ্রহ',
                    key: ValueKey('collaboration-idea-role'),
                  ),
              ],
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(
              subject.isIdea
                  ? '/ideas/${subject.id}'
                  : BusinessRoutes.detail(subject.id),
            ),
          ),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(KSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: KLocalizedText(
                        request.iAmRequester
                            ? 'যাকে পাঠিয়েছেন'
                            : 'যিনি পাঠিয়েছেন',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                    BusinessPill(
                      collaborationStatusLabel(request.status),
                      color: collaborationStatusColor(request.status),
                    ),
                  ],
                ),
                Text(
                  other.displayName.isEmpty
                      ? KaajLocalizations.text(context, 'নাম দেওয়া হয়নি')
                      : other.displayName,
                  style: theme.textTheme.titleMedium,
                ),
                if (request.fromBusiness != null) ...[
                  const SizedBox(height: KSpacing.xs),
                  Row(
                    children: [
                      const Icon(Icons.storefront_outlined, size: 18),
                      const SizedBox(width: KSpacing.xs),
                      const KLocalizedText('ব্যবসার পক্ষ থেকে:'),
                      const SizedBox(width: KSpacing.xs),
                      Expanded(child: Text(request.fromBusiness!.name)),
                    ],
                  ),
                ],
                const SizedBox(height: KSpacing.sm),
                Text(request.message),
              ],
            ),
          ),
        ),
        if (request.conversationId != null)
          OutlinedButton.icon(
            key: const ValueKey('collaboration-chat'),
            onPressed: () =>
                context.push(AppRoutes.chatThread(request.conversationId!)),
            icon: const Icon(Icons.chat_bubble_outline),
            label: const KLocalizedText('চ্যাট খুলুন'),
          ),
        if (request.status == 'ACCEPTED' ||
            request.status == 'AGREED' ||
            request.status == 'ENDED' ||
            agreement.summary != null)
          Card(
            key: const ValueKey('collaboration-agreement'),
            child: Padding(
              padding: const EdgeInsets.all(KSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  KLocalizedText(
                    'নীতিগত সমঝোতা',
                    style: theme.textTheme.titleSmall,
                  ),
                  const SizedBox(height: KSpacing.xs),
                  if (agreement.summary != null)
                    Text(agreement.summary!)
                  else
                    const KLocalizedText('এখনো কোনো সারাংশ লেখা হয়নি।'),
                  const SizedBox(height: KSpacing.sm),
                  _AgreedRow(label: 'আপনি সম্মত', agreed: agreement.agreedByMe),
                  _AgreedRow(
                    label: 'অন্য পক্ষ সম্মত',
                    agreed: agreement.agreedByThem,
                  ),
                ],
              ),
            ),
          ),
        if (request.allowedActions.isNotEmpty) ...[
          const SizedBox(height: KSpacing.sm),
          Wrap(
            spacing: KSpacing.sm,
            runSpacing: KSpacing.sm,
            children: [
              for (final action in request.allowedActions)
                _isNegative(action)
                    ? OutlinedButton(
                        key: ValueKey('collaboration-action-${action.wire}'),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 44),
                        ),
                        onPressed: () => _act(context, ref, action),
                        child: KLocalizedText(_actionLabel(action)),
                      )
                    : FilledButton(
                        key: ValueKey('collaboration-action-${action.wire}'),
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(0, 44),
                        ),
                        onPressed: () => _act(context, ref, action),
                        child: KLocalizedText(_actionLabel(action)),
                      ),
            ],
          ),
        ],
        if (request.history.isNotEmpty) ...[
          const BusinessSectionTitle('ইতিহাস'),
          for (final event in request.history)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                Icons.circle,
                size: 12,
                color: collaborationStatusColor(event.toStatus),
              ),
              title: KLocalizedText(collaborationStatusLabel(event.toStatus)),
              subtitle: Text(
                [
                  KaajLocalizations.text(context, _historyBy(event.by)),
                  if (event.at != null) KFormat.dateTime(context, event.at!),
                  ?event.note,
                ].join(' · '),
              ),
            ),
        ],
      ],
    );
  }

  static bool _isNegative(CollaborationAction action) =>
      action == CollaborationAction.decline ||
      action == CollaborationAction.withdraw ||
      action == CollaborationAction.end;
}

class _AgreedRow extends StatelessWidget {
  const _AgreedRow({required this.label, required this.agreed});

  final String label;
  final bool agreed;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(
        agreed ? Icons.check_circle : Icons.radio_button_unchecked,
        size: 18,
        color: agreed ? KColors.success : KColors.textSecondary,
      ),
      const SizedBox(width: KSpacing.xs),
      KLocalizedText(label),
    ],
  );
}

/// Confirms one action with an optional note (and the agreement summary
/// for AGREE), sends it and shows a refusal in place.
class _ActionDialog extends ConsumerStatefulWidget {
  const _ActionDialog({required this.request, required this.action});

  final Collaboration request;
  final CollaborationAction action;

  @override
  ConsumerState<_ActionDialog> createState() => _ActionDialogState();
}

class _ActionDialogState extends ConsumerState<_ActionDialog> {
  final _note = TextEditingController();
  late final _summary = TextEditingController(
    text: widget.request.agreement.summary,
  );
  bool _sending = false;
  Object? _error;

  bool get _agree => widget.action == CollaborationAction.agree;

  @override
  void dispose() {
    _note.dispose();
    _summary.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_sending) return;
    if (_note.text.trim().length > 500 || _summary.text.trim().length > 1000) {
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref
          .read(businessRepositoryProvider)
          .act(
            widget.request.id,
            widget.action,
            note: _note.text,
            summary: _agree ? _summary.text : null,
          );
      if (mounted) Navigator.pop(context, true);
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: KLocalizedText(_actionLabel(widget.action)),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_agree) ...[
            const KLocalizedText(
              'আপনারা কী বিষয়ে নীতিগতভাবে সম্মত হয়েছেন, সংক্ষেপে লিখুন। এটি কোনো আইনি চুক্তি নয়।',
            ),
            const SizedBox(height: KSpacing.sm),
            KTextField(
              key: const ValueKey('collaboration-summary'),
              label: 'সমঝোতার সারাংশ (ঐচ্ছিক)',
              controller: _summary,
              minLines: 2,
              maxLines: 5,
            ),
            const SizedBox(height: KSpacing.sm),
          ],
          KTextField(
            key: const ValueKey('collaboration-note'),
            label: 'নোট (ঐচ্ছিক)',
            controller: _note,
            minLines: 1,
            maxLines: 3,
          ),
          if (_error != null) ...[
            const SizedBox(height: KSpacing.sm),
            InlineError(
              message: failureText(context, _error!, 'কাজটি সম্পন্ন হয়নি।'),
            ),
          ],
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: _sending ? null : () => Navigator.pop(context, false),
        child: const KLocalizedText('বাতিল'),
      ),
      FilledButton(
        key: const ValueKey('collaboration-confirm'),
        style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
        onPressed: _sending ? null : _send,
        child: _sending
            ? const SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : KLocalizedText(_actionLabel(widget.action)),
      ),
    ],
  );
}

// --------------------------------------------------------------------- send

/// Sends a collaboration request about a business (or an idea, from the
/// Ideas screens), optionally on behalf of one of my businesses.
class CollaborationRequestFormScreen extends ConsumerStatefulWidget {
  const CollaborationRequestFormScreen({
    required this.subjectType,
    required this.subjectId,
    this.ideaRoleId,
    super.key,
  });

  /// BUSINESS or IDEA.
  final String subjectType;
  final String subjectId;
  final String? ideaRoleId;

  @override
  ConsumerState<CollaborationRequestFormScreen> createState() =>
      _CollaborationRequestFormScreenState();
}

class _CollaborationRequestFormScreenState
    extends ConsumerState<CollaborationRequestFormScreen> {
  final _form = GlobalKey<FormState>();
  final _message = TextEditingController();
  String? _fromBusinessId;
  bool _sending = false;
  Object? _error;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_sending || !_form.currentState!.validate()) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final created = await ref
          .read(businessRepositoryProvider)
          .requestCollaboration(
            subjectType: widget.subjectType,
            subjectId: widget.subjectId,
            message: _message.text,
            fromBusinessId: _fromBusinessId,
            ideaRoleId: widget.ideaRoleId,
          );
      ref.invalidate(collaborationsProvider('sent'));
      if (mounted) {
        context.pushReplacement(BusinessRoutes.collaboration(created.id));
      }
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isBusiness = widget.subjectType == 'BUSINESS';
    final subject = isBusiness
        ? ref.watch(businessDetailProvider(widget.subjectId)).valueOrNull
        : null;
    final mine =
        (ref.watch(myBusinessesProvider).valueOrNull?.items ??
                const <Business>[])
            .where(
              (business) =>
                  business.canEdit &&
                  !business.isSuspended &&
                  business.id != widget.subjectId,
            )
            .toList(growable: false);
    final alreadyOpen =
        _error != null &&
        ErrorMapper.from(_error!).code == 'COLLABORATION_ALREADY_OPEN';
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('সহযোগিতার অনুরোধ পাঠান')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(KSpacing.md),
          children: [
            const CollaborationNoticeCard(notice: BnEn()),
            if (subject != null)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.storefront_outlined),
                  title: Text(subject.name),
                  subtitle: Text(businessStageText(context, subject)),
                ),
              ),
            const SizedBox(height: KSpacing.sm),
            KTextField(
              key: const ValueKey('collaboration-message'),
              label: 'আপনার বার্তা',
              hintText: 'আপনি কে, কী ধরনের সহযোগিতা চান এবং কেন',
              controller: _message,
              minLines: 4,
              maxLines: 8,
              validator: (value) {
                final length = value?.trim().length ?? 0;
                if (length < 10) return 'কমপক্ষে ১০ অক্ষরে বার্তা লিখুন';
                if (length > 1000) {
                  return 'বার্তা ১০০০ অক্ষরের বেশি হতে পারবে না';
                }
                return null;
              },
            ),
            if (mine.isNotEmpty) ...[
              const SizedBox(height: KSpacing.md),
              DropdownButtonFormField<String?>(
                key: const ValueKey('collaboration-from-business'),
                initialValue: _fromBusinessId,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: KaajLocalizations.text(
                    context,
                    'কোন ব্যবসার পক্ষ থেকে (ঐচ্ছিক)',
                  ),
                ),
                items: [
                  DropdownMenuItem<String?>(
                    child: KLocalizedText('ব্যক্তিগতভাবে'),
                  ),
                  for (final business in mine)
                    DropdownMenuItem<String?>(
                      value: business.id,
                      child: Text(business.name),
                    ),
                ],
                onChanged: (value) => setState(() => _fromBusinessId = value),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: KSpacing.md),
              InlineError(
                message: failureText(context, _error!, 'অনুরোধ পাঠানো যায়নি।'),
              ),
              if (alreadyOpen)
                TextButton(
                  key: const ValueKey('collaboration-see-open'),
                  onPressed: () => context.push(BusinessRoutes.collaborations),
                  child: const KLocalizedText('আমার অনুরোধগুলো দেখুন'),
                ),
            ],
            const SizedBox(height: KSpacing.lg),
            KPrimaryButton(
              key: const ValueKey('collaboration-send'),
              label: 'অনুরোধ পাঠান',
              isLoading: _sending,
              onPressed: _sending ? null : _send,
            ),
          ],
        ),
      ),
    );
  }
}

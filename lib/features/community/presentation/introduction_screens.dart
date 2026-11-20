import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_text_field.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import '../community_routes.dart';
import '../domain/community_models.dart';
import 'community_providers.dart';
import 'community_widgets.dart';

const _introductionCodes = {
  'RATE_LIMITED': 'দিনে ৫টি পরিচয় অনুরোধ পাঠানো যায়। পরে আবার চেষ্টা করুন।',
  'NOT_FOUND':
      'এই বিশেষজ্ঞ এখন অনুরোধ নিচ্ছেন না, অথবা বেছে নেওয়া বিষয়টি আপনার নয়।',
};

// ---------------------------------------------------------------------------
// Send

/// Asks an expert (an approved mentor) for an introduction about an idea,
/// a business or a learning goal.
class SendIntroductionScreen extends ConsumerStatefulWidget {
  const SendIntroductionScreen({
    required this.expertUserId,
    this.expertName,
    super.key,
  });

  final String expertUserId;
  final String? expertName;

  @override
  ConsumerState<SendIntroductionScreen> createState() =>
      _SendIntroductionScreenState();
}

class _SendIntroductionScreenState
    extends ConsumerState<SendIntroductionScreen> {
  final _form = GlobalKey<FormState>();
  final _goal = TextEditingController();
  final _message = TextEditingController();
  IntroductionContext _type = IntroductionContext.learningGoal;
  ContextChoice? _choice;
  bool _allowIdeaAccess = false;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _goal.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_sending || !(_form.currentState?.validate() ?? false)) return;
    if (_type != IntroductionContext.learningGoal && _choice == null) {
      setState(
        () => _error = KaajLocalizations.text(
          context,
          'কোন বিষয়ে কথা বলতে চান, তা বেছে নিন।',
        ),
      );
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final created = await ref
          .read(communityRepositoryProvider)
          .sendIntroduction(
            IntroductionDraft(
              expertUserId: widget.expertUserId,
              contextType: _type,
              contextId: _choice?.id,
              learningGoal: _goal.text,
              message: _message.text,
              allowIdeaAccess:
                  _type == IntroductionContext.idea &&
                  (_choice?.owned ?? false) &&
                  _allowIdeaAccess,
            ),
          );
      ref.invalidate(introductionsProvider);
      if (!mounted) return;
      showCommunitySnack(context, 'অনুরোধ পাঠানো হয়েছে।');
      context.pushReplacement(CommunityPaths.introduction(created.id));
    } on Object catch (error) {
      if (!mounted) return;
      setState(
        () => _error = communityFailureText(
          context,
          error,
          'অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।',
          codes: _introductionCodes,
        ),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('পরিচয়ের অনুরোধ')),
      body: Form(
        key: _form,
        child: ListView(
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
              'বিশেষজ্ঞ গ্রহণ করলে আপনাদের মধ্যে অ্যাপের ভেতরে চ্যাট খুলবে। ফোন নম্বর বা ইমেইল কাউকে দেখানো হয় না। উত্তর না এলে ৭ দিন পরে অনুরোধের মেয়াদ শেষ হয়।',
            ),
            const SizedBox(height: KSpacing.md),
            KLocalizedText(
              'কোন বিষয়ে কথা বলতে চান',
              style: theme.textTheme.titleSmall,
            ),
            Wrap(
              spacing: KSpacing.sm,
              children: [
                for (final type in IntroductionContext.values)
                  ChoiceChip(
                    key: ValueKey('intro-context-${type.wire}'),
                    label: KLocalizedText(contextLabel(type)),
                    selected: _type == type,
                    onSelected: (_) => setState(() {
                      _type = type;
                      _choice = null;
                      _allowIdeaAccess = false;
                    }),
                  ),
              ],
            ),
            const SizedBox(height: KSpacing.sm),
            if (_type == IntroductionContext.learningGoal)
              KTextField(
                key: const ValueKey('intro-goal'),
                label: 'কী শিখতে চান',
                hintText: 'যেমন: নিজের দর্জির দোকানের হিসাব রাখা শিখতে চাই',
                controller: _goal,
                maxLines: 3,
                minLines: 2,
                validator: (value) {
                  final length = value?.trim().length ?? 0;
                  return length < 10 || length > 300
                      ? '১০ থেকে ৩০০ অক্ষরের মধ্যে লিখুন।'
                      : null;
                },
              )
            else
              _ContextPicker(
                type: _type,
                selected: _choice,
                onSelected: (choice) => setState(() {
                  _choice = choice;
                  _allowIdeaAccess = false;
                }),
              ),
            if (_type == IntroductionContext.idea &&
                (_choice?.owned ?? false)) ...[
              SwitchListTile(
                key: const ValueKey('intro-idea-access'),
                contentPadding: EdgeInsets.zero,
                value: _allowIdeaAccess,
                onChanged: (value) => setState(() => _allowIdeaAccess = value),
                title: const KLocalizedText(
                  'বিশেষজ্ঞকে আইডিয়ার পুরো বিবরণ দেখতে দিন',
                ),
                subtitle: const KLocalizedText(
                  'চালু করলে, বিশেষজ্ঞ অনুরোধ গ্রহণের সময় গোপনীয়তার শর্ত মেনে নিলে তবেই আপনার আইডিয়ার পুরো বিবরণ দেখতে পারবেন। বন্ধ রাখলে শুধু সারাংশ দেখবেন।',
                ),
              ),
            ],
            const SizedBox(height: KSpacing.md),
            KTextField(
              key: const ValueKey('intro-message'),
              label: 'বিশেষজ্ঞকে বার্তা',
              helperText: 'নিজের পরিচয় ও কী সাহায্য চান তা সংক্ষেপে লিখুন।',
              controller: _message,
              maxLines: 5,
              minLines: 3,
              validator: (value) {
                final length = value?.trim().length ?? 0;
                return length < 10 || length > 1000
                    ? '১০ থেকে ১০০০ অক্ষরের মধ্যে লিখুন।'
                    : null;
              },
            ),
            if (_error != null) ...[
              const SizedBox(height: KSpacing.md),
              Text(
                _error!,
                key: const ValueKey('intro-error'),
                style: const TextStyle(color: KColors.danger),
              ),
            ],
            const SizedBox(height: KSpacing.lg),
            FilledButton(
              key: const ValueKey('intro-send'),
              onPressed: _sending ? null : _send,
              child: _sending
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const KLocalizedText('অনুরোধ পাঠান'),
            ),
            const SizedBox(height: KSpacing.sm),
            const KLocalizedText(
              'দিনে সর্বোচ্চ ৫টি অনুরোধ পাঠানো যায়, আর একজন বিশেষজ্ঞের কাছে একসাথে একটিই।',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ContextPicker extends ConsumerWidget {
  const _ContextPicker({
    required this.type,
    required this.selected,
    required this.onSelected,
  });

  final ContextChoice? selected;
  final ValueChanged<ContextChoice> onSelected;
  final IntroductionContext type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final choices = ref.watch(introductionContextsProvider(type));
    return choices.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(KSpacing.md),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => RetryPanel(
        error: error,
        label: 'তালিকা লোড করা যায়নি।',
        onRetry: () => ref.invalidate(introductionContextsProvider(type)),
      ),
      data: (items) {
        if (items.isEmpty) {
          return KLocalizedText(
            type == IntroductionContext.idea
                ? 'আপনার বা আপনার দলের কোনো আইডিয়া নেই। শেখার লক্ষ্য বেছে নিন।'
                : 'আপনি কোনো ব্যবসার সদস্য নন। শেখার লক্ষ্য বেছে নিন।',
          );
        }
        return RadioGroup<String>(
          groupValue: selected?.id,
          onChanged: (id) {
            for (final item in items) {
              if (item.id == id) onSelected(item);
            }
          },
          child: Column(
            children: [
              for (final item in items)
                RadioListTile<String>(
                  key: ValueKey('intro-choice-${item.id}'),
                  contentPadding: EdgeInsets.zero,
                  value: item.id,
                  title: Text(item.title),
                  subtitle: type == IntroductionContext.idea
                      ? KLocalizedText(
                          item.owned ? 'আপনার আইডিয়া' : 'আপনি দলের সদস্য',
                        )
                      : null,
                ),
            ],
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// List

class IntroductionsScreen extends StatelessWidget {
  const IntroductionsScreen({super.key});

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 2,
    child: Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('পরিচয়ের অনুরোধ'),
        bottom: const TabBar(
          tabs: [
            Tab(
              key: ValueKey('intro-received'),
              child: KLocalizedText('এসেছে'),
            ),
            Tab(
              key: ValueKey('intro-sent'),
              child: KLocalizedText('পাঠিয়েছি'),
            ),
          ],
        ),
      ),
      body: const TabBarView(
        children: [
          IntroductionList(box: 'received'),
          IntroductionList(box: 'sent'),
        ],
      ),
    ),
  );
}

class IntroductionList extends ConsumerWidget {
  const IntroductionList({required this.box, super.key});

  /// `received` or `sent`.
  final String box;

  @override
  Widget build(
    BuildContext context,
    WidgetRef ref,
  ) => CommunityPagedList<Introduction>(
    provider: introductionsProvider(box),
    fetchMore: (cursor) => ref
        .read(communityRepositoryProvider)
        .introductions(box, cursor: cursor),
    loadMoreKey: ValueKey('intro-$box-more'),
    errorLabel: 'অনুরোধগুলো লোড করা যায়নি।',
    empty: KEmptyState(
      icon: Icons.handshake_outlined,
      title: box == 'received'
          ? 'কোনো অনুরোধ আসেনি'
          : 'আপনি কোনো অনুরোধ পাঠাননি',
      message: box == 'received'
          ? 'কেউ আপনার পরামর্শ চাইলে এখানে দেখা যাবে।'
          : 'খুঁজুন ও জানুন > মানুষ > মেন্টর থেকে একজন বিশেষজ্ঞের কাছে অনুরোধ পাঠান।',
    ),
    itemBuilder: (context, item) => IntroductionCard(introduction: item),
  );
}

class IntroductionCard extends StatelessWidget {
  const IntroductionCard({required this.introduction, super.key});

  final Introduction introduction;

  @override
  Widget build(BuildContext context) {
    final item = introduction;
    final theme = Theme.of(context);
    return Card(
      key: ValueKey('intro-${item.id}'),
      margin: EdgeInsets.zero,
      child: ListTile(
        onTap: () => context.push(CommunityPaths.introduction(item.id)),
        title: Text(item.other.displayName, style: theme.textTheme.titleMedium),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              [
                KaajLocalizations.text(context, contextLabel(item.contextType)),
                if (item.contextSummary != null) item.contextSummary!,
              ].join(' · '),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: KSpacing.xs),
            Row(
              children: [
                StatusPill(
                  introductionStatusLabel(item.status),
                  color: statusColor(item.status),
                ),
                const SizedBox(width: KSpacing.sm),
                if (item.createdAt != null)
                  Flexible(
                    child: Text(
                      KFormat.relativePast(context, item.createdAt!),
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
              ],
            ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Detail

class IntroductionDetailScreen extends ConsumerStatefulWidget {
  const IntroductionDetailScreen({required this.introductionId, super.key});

  final String introductionId;

  @override
  ConsumerState<IntroductionDetailScreen> createState() =>
      _IntroductionDetailScreenState();
}

class _IntroductionDetailScreenState
    extends ConsumerState<IntroductionDetailScreen> {
  bool _busy = false;
  bool _confidentiality = false;

  String get _id => widget.introductionId;

  Future<void> _run(
    Future<Introduction> Function() action,
    String done,
    String fallback,
  ) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      ref
        ..invalidate(introductionProvider(_id))
        ..invalidate(introductionsProvider);
      if (mounted) showCommunitySnack(context, done);
    } on Object catch (error) {
      if (mounted) showCommunityFailure(context, error, fallback);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _accept(Introduction item) => _run(
    () => ref
        .read(communityRepositoryProvider)
        .acceptIntroduction(
          _id,
          acceptConfidentiality: item.allowIdeaAccess && _confidentiality,
        ),
    'অনুরোধ গ্রহণ করেছেন। এখন চ্যাট করতে পারবেন।',
    'গ্রহণ করা যায়নি। আবার চেষ্টা করুন।',
  );

  Future<void> _decline() async {
    final reason = await askText(
      context,
      title: 'অনুরোধ প্রত্যাখ্যান করবেন?',
      label: 'কারণ (ঐচ্ছিক)',
      confirmLabel: 'প্রত্যাখ্যান করুন',
      maxLength: 300,
    );
    if (reason == null || !mounted) return;
    await _run(
      () => ref
          .read(communityRepositoryProvider)
          .declineIntroduction(_id, reason: reason),
      'অনুরোধ প্রত্যাখ্যান করা হয়েছে।',
      'প্রত্যাখ্যান করা যায়নি। আবার চেষ্টা করুন।',
    );
  }

  Future<void> _withdraw() async {
    final ok = await confirmAction(
      context,
      title: 'অনুরোধ প্রত্যাহার করবেন?',
      message: 'বিশেষজ্ঞ আর এই অনুরোধ দেখতে পাবেন না।',
      confirmLabel: 'প্রত্যাহার করুন',
    );
    if (!ok || !mounted) return;
    await _run(
      () => ref.read(communityRepositoryProvider).withdrawIntroduction(_id),
      'অনুরোধ প্রত্যাহার করা হয়েছে।',
      'প্রত্যাহার করা যায়নি। আবার চেষ্টা করুন।',
    );
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(introductionProvider(_id));
    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('পরিচয়ের অনুরোধ'),
        actions: [
          IconButton(
            key: const ValueKey('intro-report'),
            tooltip: KaajLocalizations.text(context, 'রিপোর্ট করুন'),
            icon: const Icon(Icons.flag_outlined),
            onPressed: () =>
                context.push(AppRoutes.report('INTRODUCTION', _id)),
          ),
        ],
      ),
      body: CommunityAsync<Introduction>(
        value: value,
        errorLabel: 'অনুরোধটি লোড করা যায়নি।',
        onRetry: () => ref.invalidate(introductionProvider(_id)),
        builder: (item) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(introductionProvider(_id));
            await ref
                .read(introductionProvider(_id).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: _body(context, item),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, Introduction item) {
    final theme = Theme.of(context);
    final pending = item.status == 'PENDING';
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                item.other.displayName,
                style: theme.textTheme.titleLarge,
              ),
            ),
            StatusPill(
              introductionStatusLabel(item.status),
              color: statusColor(item.status),
            ),
          ],
        ),
        KLocalizedText(
          item.iAmExpert
              ? 'আপনার পরামর্শ চেয়েছেন'
              : 'বিশেষজ্ঞ, আপনি অনুরোধ পাঠিয়েছেন',
        ),
        if (!item.iAmExpert && item.expert.bio != null) ...[
          const SizedBox(height: KSpacing.xs),
          Text(item.expert.bio!, style: theme.textTheme.bodySmall),
        ],
        const Divider(height: KSpacing.lg),
        InfoRow(
          icon: Icons.topic_outlined,
          label: contextLabel(item.contextType),
          value:
              item.contextSummary ??
              KaajLocalizations.text(context, 'বিষয়টি গ্রহণের পরে দেখা যাবে'),
        ),
        InfoRow(
          icon: Icons.chat_bubble_outline,
          label: 'বার্তা',
          value: item.message,
        ),
        if (item.createdAt != null)
          InfoRow(
            icon: Icons.schedule,
            label: 'পাঠানো হয়েছে',
            value: KFormat.dateTime(context, item.createdAt!),
          ),
        if (pending && item.expiresAt != null)
          InfoRow(
            icon: Icons.hourglass_bottom,
            label: 'উত্তরের শেষ সময়',
            value: KFormat.dateTime(context, item.expiresAt!),
          ),
        if (item.decidedAt != null)
          InfoRow(
            icon: Icons.event_available_outlined,
            label: 'সিদ্ধান্তের সময়',
            value: KFormat.dateTime(context, item.decidedAt!),
          ),
        if (item.declineReason != null)
          InfoRow(
            icon: Icons.info_outline,
            label: 'প্রত্যাখ্যানের কারণ',
            value: item.declineReason!,
          ),
        if (item.allowIdeaAccess)
          Card(
            margin: const EdgeInsets.symmetric(vertical: KSpacing.sm),
            child: Padding(
              padding: const EdgeInsets.all(KSpacing.md),
              child: KLocalizedText(
                item.ideaAccessGranted
                    ? 'আইডিয়ার পুরো বিবরণ দেখার অনুমতি দেওয়া হয়েছে।'
                    : item.iAmExpert
                    ? 'অনুরোধকারী আইডিয়ার পুরো বিবরণ দেখাতে রাজি। দেখতে হলে গোপনীয়তার শর্ত মেনে গ্রহণ করুন।'
                    : 'আপনি বিশেষজ্ঞকে আইডিয়ার পুরো বিবরণ দেখার অনুমতি দিয়েছেন (গোপনীয়তার শর্ত মানলে)।',
              ),
            ),
          ),
        const SizedBox(height: KSpacing.md),
        if (item.can('ACCEPT')) ...[
          if (item.allowIdeaAccess)
            CheckboxListTile(
              key: const ValueKey('intro-confidentiality'),
              contentPadding: EdgeInsets.zero,
              value: _confidentiality,
              onChanged: (value) =>
                  setState(() => _confidentiality = value ?? false),
              title: const KLocalizedText(
                'আমি গোপনীয়তার শর্ত মানছি: আইডিয়ার বিবরণ কারও সাথে শেয়ার করব না বা নিজে ব্যবহার করব না।',
              ),
            ),
          FilledButton(
            key: const ValueKey('intro-accept'),
            onPressed: _busy ? null : () => _accept(item),
            child: const KLocalizedText('গ্রহণ করুন'),
          ),
          const SizedBox(height: KSpacing.sm),
        ],
        if (item.can('DECLINE')) ...[
          OutlinedButton(
            key: const ValueKey('intro-decline'),
            onPressed: _busy ? null : _decline,
            child: const KLocalizedText('প্রত্যাখ্যান করুন'),
          ),
          const SizedBox(height: KSpacing.sm),
        ],
        if (item.can('WITHDRAW')) ...[
          OutlinedButton(
            key: const ValueKey('intro-withdraw'),
            onPressed: _busy ? null : _withdraw,
            child: const KLocalizedText('অনুরোধ প্রত্যাহার করুন'),
          ),
          const SizedBox(height: KSpacing.sm),
        ],
        if (item.conversationId != null) ...[
          FilledButton.icon(
            key: const ValueKey('intro-chat'),
            onPressed: () =>
                context.push(AppRoutes.chatThread(item.conversationId!)),
            icon: const Icon(Icons.chat_outlined),
            label: const KLocalizedText('চ্যাট খুলুন'),
          ),
          const SizedBox(height: KSpacing.sm),
        ],
        if (!item.iAmExpert && item.status == 'ACCEPTED')
          OutlinedButton.icon(
            key: const ValueKey('intro-book'),
            onPressed: () => context.push(
              CommunityPaths.book(
                item.expert.userId,
                name: item.expert.displayName,
                introductionId: item.id,
              ),
            ),
            icon: const Icon(Icons.event_outlined),
            label: const KLocalizedText('পরামর্শের সময় নিন'),
          ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../../core/widgets/k_text_field.dart';
import '../domain/idea_models.dart';
import '../idea_routes.dart';
import 'idea_providers.dart';
import 'idea_widgets.dart';

/// `/ideas/:id/team`: the owner and the people who agreed in principle,
/// with the not-a-legal-partnership notice. The owner adds people from an
/// agreed collaboration and removes members.
class IdeaTeamScreen extends ConsumerStatefulWidget {
  const IdeaTeamScreen({required this.ideaId, super.key});

  final String ideaId;

  @override
  ConsumerState<IdeaTeamScreen> createState() => _IdeaTeamScreenState();
}

class _IdeaTeamScreenState extends ConsumerState<IdeaTeamScreen> {
  String? _busy;

  String get _id => widget.ideaId;

  void _changed() {
    ref
      ..invalidate(ideaTeamProvider(_id))
      ..invalidate(ideaAgreedCollaborationsProvider(_id))
      ..invalidate(ideaDetailProvider(_id));
  }

  Future<void> _add(IdeaCollaboration collaboration) async {
    if (_busy != null) return;
    final roleLabel = await showDialog<String>(
      context: context,
      builder: (_) =>
          _AddMemberDialog(name: collaboration.requester.displayName),
    );
    if (roleLabel == null || !mounted) return;
    setState(() => _busy = collaboration.id);
    try {
      await ref
          .read(ideaRepositoryProvider)
          .addMember(_id, collaboration.id, roleLabel: roleLabel);
      _changed();
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, 'দলে যোগ করা যায়নি।');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _remove(IdeaMember member) async {
    if (_busy != null) return;
    final confirmed = await confirmIdeaAction(
      context,
      title: 'দল থেকে সরাবেন?',
      message:
          'তিনি আর বিস্তারিত দেখতে বা দলের আলাপে থাকতে পারবেন না। সহযোগিতার অনুরোধটি থেকে যাবে।',
      confirmLabel: 'আইডিয়ার দল থেকে সরান',
    );
    if (!confirmed || !mounted) return;
    setState(() => _busy = member.userId);
    try {
      await ref.read(ideaRepositoryProvider).removeMember(_id, member.userId);
      _changed();
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, 'দল থেকে সরানো যায়নি।');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final team = ref.watch(ideaTeamProvider(_id));
    final idea = ref.watch(ideaDetailProvider(_id)).valueOrNull;
    final isOwner = idea?.isOwner ?? false;
    final agreed = isOwner
        ? ref.watch(ideaAgreedCollaborationsProvider(_id))
        : null;
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('আইডিয়ার দল')),
      body: RefreshIndicator(
        onRefresh: () async {
          _changed();
          await ref
              .read(ideaTeamProvider(_id).future)
              .then<void>((_) {}, onError: (_) {});
        },
        child: team.when(
          skipLoadingOnRefresh: true,
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => IdeaLoadError(
            error: error,
            onRetry: () => ref.invalidate(ideaTeamProvider(_id)),
          ),
          data: (data) {
            final memberIds = {for (final item in data.items) item.userId};
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(KSpacing.md),
              children: [
                if (data.notice case final notice?)
                  IdeaNoticeCard(
                    key: const ValueKey('idea-team-notice'),
                    notice: notice,
                    icon: Icons.gavel_outlined,
                  ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.star_outline),
                  title: Text(data.owner.displayName),
                  subtitle: const KLocalizedText('আইডিয়ার মালিক'),
                ),
                for (final member in data.items)
                  ListTile(
                    key: ValueKey('idea-member-${member.userId}'),
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.person_outline),
                    title: Text(member.displayName),
                    subtitle: Text(
                      [
                        ?member.roleLabel,
                        if (member.role case final role?)
                          ideaRoleText(context, role),
                        KaajLocalizations.text(context, 'নীতিগতভাবে সম্মত'),
                        if (member.agreedInPrincipleAt case final at?)
                          KFormat.date(context, at),
                      ].join(' · '),
                    ),
                    trailing: isOwner
                        ? IconButton(
                            key: ValueKey('idea-remove-${member.userId}'),
                            tooltip: KaajLocalizations.text(
                              context,
                              'আইডিয়ার দল থেকে সরান',
                            ),
                            icon: const Icon(Icons.person_remove_outlined),
                            onPressed: _busy == null
                                ? () => _remove(member)
                                : null,
                          )
                        : null,
                  ),
                if (data.items.isEmpty)
                  const KLocalizedText(
                    'দলে এখনো আর কেউ নেই।',
                    style: TextStyle(color: KColors.textSecondary),
                  ),
                if (agreed != null)
                  IdeaSection(
                    title: 'আইডিয়ার দলে যোগ করুন',
                    children: [
                      const KLocalizedText(
                        'যাঁদের সঙ্গে সহযোগিতায় দুজনেই সম্মত হয়েছেন, শুধু তাঁদের দলে যোগ করা যায়।',
                        style: TextStyle(color: KColors.textSecondary),
                      ),
                      ...agreed.when(
                        loading: () => const [LinearProgressIndicator()],
                        error: (error, _) => [
                          Text(
                            failureText(
                              context,
                              error,
                              'সম্মত সহযোগিতাগুলো লোড করা যায়নি।',
                            ),
                          ),
                        ],
                        data: (items) {
                          final candidates = items
                              .where(
                                (item) =>
                                    !memberIds.contains(item.requester.userId),
                              )
                              .toList(growable: false);
                          if (candidates.isEmpty) {
                            return const [
                              KLocalizedText(
                                'এখন যোগ করার মতো কেউ নেই।',
                                style: TextStyle(color: KColors.textSecondary),
                              ),
                            ];
                          }
                          return [
                            for (final item in candidates)
                              ListTile(
                                key: ValueKey('idea-candidate-${item.id}'),
                                contentPadding: EdgeInsets.zero,
                                leading: const Icon(Icons.handshake_outlined),
                                title: Text(item.requester.displayName),
                                subtitle: Text(
                                  item.message,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                onTap: () => context.push(
                                  IdeaPaths.collaboration(item.id),
                                ),
                                trailing: _busy == item.id
                                    ? const SizedBox.square(
                                        dimension: 24,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : FilledButton(
                                        key: ValueKey('idea-add-${item.id}'),
                                        style: FilledButton.styleFrom(
                                          minimumSize: const Size(0, 44),
                                        ),
                                        onPressed: _busy == null
                                            ? () => _add(item)
                                            : null,
                                        child: const KLocalizedText(
                                          'আইডিয়ার দলে নিন',
                                        ),
                                      ),
                              ),
                          ];
                        },
                      ),
                    ],
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _AddMemberDialog extends StatefulWidget {
  const _AddMemberDialog({required this.name});

  final String name;

  @override
  State<_AddMemberDialog> createState() => _AddMemberDialogState();
}

class _AddMemberDialogState extends State<_AddMemberDialog> {
  final _label = TextEditingController();

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.name),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const KLocalizedText(
          'দলের সদস্য বিস্তারিত দেখবেন ও দলের আলাপে থাকবেন। এটি কোনো আইনি অংশীদারি নয়।',
        ),
        TextField(
          key: const ValueKey('idea-member-label'),
          controller: _label,
          maxLength: 80,
          decoration: InputDecoration(
            labelText: KaajLocalizations.text(
              context,
              'দলে তাঁর ভূমিকা (ঐচ্ছিক)',
            ),
          ),
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const KLocalizedText('বাতিল'),
      ),
      FilledButton(
        key: const ValueKey('idea-member-confirm'),
        style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
        onPressed: () => Navigator.pop(context, _label.text.trim()),
        child: const KLocalizedText('আইডিয়ার দলে নিন'),
      ),
    ],
  );
}

/// `/ideas/:id/convert` (owner): turns the idea into a business. The team
/// is invited as staff.
class IdeaConvertScreen extends ConsumerStatefulWidget {
  const IdeaConvertScreen({required this.ideaId, super.key});

  final String ideaId;

  @override
  ConsumerState<IdeaConvertScreen> createState() => _IdeaConvertScreenState();
}

class _IdeaConvertScreenState extends ConsumerState<IdeaConvertScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _licence = TextEditingController();
  String _stage = 'INFORMAL';
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _licence.dispose();
    super.dispose();
  }

  Future<void> _convert() async {
    if (_saving || !(_form.currentState?.validate() ?? false)) return;
    final confirmed = await confirmIdeaAction(
      context,
      title: 'ব্যবসায় রূপ দেবেন?',
      message:
          'আইডিয়াটি একটি ব্যবসা হবে এবং দলের সবাই কর্মী হিসেবে আমন্ত্রণ পাবেন। এটি আর ফেরানো যাবে না।',
      confirmLabel: 'আইডিয়া থেকে ব্যবসা তৈরি করুন',
    );
    if (!confirmed || !mounted) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final businessId = await ref
          .read(ideaRepositoryProvider)
          .convert(
            widget.ideaId,
            stage: _stage,
            name: _name.text,
            tradeLicenceNo: _stage == 'REGISTERED' ? _licence.text : null,
          );
      ref
        ..invalidate(ideaDetailProvider(widget.ideaId))
        ..invalidate(myIdeasProvider);
      if (mounted) context.pushReplacement(IdeaPaths.business(businessId));
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _error = failureText(
            context,
            error,
            'আইডিয়া থেকে ব্যবসা তৈরি করা যায়নি। আবার চেষ্টা করুন।',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final idea = ref.watch(ideaDetailProvider(widget.ideaId));
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('ব্যবসায় রূপ দিন')),
      body: idea.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => IdeaLoadError(
          error: error,
          onRetry: () => ref.invalidate(ideaDetailProvider(widget.ideaId)),
        ),
        data: (idea) => Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(KSpacing.md),
            children: [
              Text(idea.title, style: theme.textTheme.titleLarge),
              const SizedBox(height: KSpacing.sm),
              const IdeaStaticNotice(
                key: ValueKey('idea-convert-explanation'),
                icon: Icons.storefront_outlined,
                text:
                    'আইডিয়াটি থেকে একটি নতুন ব্যবসার প্রোফাইল তৈরি হবে, আপনি হবেন মালিক। দলের সদস্যরা ব্যবসায় কর্মী হিসেবে আমন্ত্রণ পাবেন; তাঁরা রাজি হলে যোগ দেবেন। আইডিয়াটি “ব্যবসায় রূপ নিয়েছে” হিসেবে থেকে যাবে।',
              ),
              if (idea.isConverted)
                const Padding(
                  padding: EdgeInsets.only(top: KSpacing.md),
                  child: KLocalizedText('এই আইডিয়া ইতিমধ্যে একটি ব্যবসা।'),
                )
              else ...[
                const SizedBox(height: KSpacing.md),
                KLocalizedText(
                  'নতুন ব্যবসার অবস্থা',
                  style: theme.textTheme.titleSmall,
                ),
                RadioGroup<String>(
                  groupValue: _stage,
                  onChanged: (value) {
                    if (value != null) setState(() => _stage = value);
                  },
                  child: const Column(
                    children: [
                      RadioListTile<String>(
                        key: ValueKey('idea-convert-INFORMAL'),
                        contentPadding: EdgeInsets.zero,
                        value: 'INFORMAL',
                        title: KLocalizedText('অনানুষ্ঠানিক ব্যবসা হিসেবে'),
                        subtitle: KLocalizedText(
                          'ট্রেড লাইসেন্স ছাড়া চলছে বা শুরু হচ্ছে।',
                        ),
                      ),
                      RadioListTile<String>(
                        key: ValueKey('idea-convert-REGISTERED'),
                        contentPadding: EdgeInsets.zero,
                        value: 'REGISTERED',
                        title: KLocalizedText('নিবন্ধিত ব্যবসা হিসেবে'),
                        subtitle: KLocalizedText(
                          'ট্রেড লাইসেন্স আছে; পরে ব্যবসা যাচাই করাতে পারবেন।',
                        ),
                      ),
                    ],
                  ),
                ),
                KTextField(
                  key: const ValueKey('idea-convert-name'),
                  label: 'ব্যবসার নাম (খালি রাখলে আইডিয়ার শিরোনাম)',
                  controller: _name,
                  validator: (value) {
                    final length = value?.trim().length ?? 0;
                    return length != 0 && (length < 2 || length > 120)
                        ? 'নতুন ব্যবসার নাম ২ থেকে ১২০ অক্ষরের হতে হবে।'
                        : null;
                  },
                ),
                if (_stage == 'REGISTERED') ...[
                  const SizedBox(height: KSpacing.sm),
                  KTextField(
                    key: const ValueKey('idea-convert-licence'),
                    label: 'নতুন ব্যবসার ট্রেড লাইসেন্স নম্বর (ঐচ্ছিক)',
                    controller: _licence,
                    validator: (value) => (value?.trim().length ?? 0) > 60
                        ? 'লাইসেন্স নম্বর সর্বোচ্চ ৬০ অক্ষরের হতে পারে।'
                        : null,
                  ),
                ],
                const SizedBox(height: KSpacing.lg),
                if (_error case final error?) ...[
                  Text(
                    error,
                    key: const ValueKey('idea-convert-error'),
                    style: const TextStyle(color: KColors.danger),
                  ),
                  const SizedBox(height: KSpacing.sm),
                ],
                KPrimaryButton(
                  key: const ValueKey('idea-convert-submit'),
                  label: 'আইডিয়া থেকে ব্যবসা তৈরি করুন',
                  isLoading: _saving,
                  onPressed: _convert,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

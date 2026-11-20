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
import '../../catalog/domain/entities/catalog_category.dart';
import '../../catalog/presentation/controllers/catalog_providers.dart';
import '../../catalog/presentation/widgets/area_picker.dart';
import '../community_routes.dart';
import '../domain/community_models.dart';
import 'community_providers.dart';
import 'community_widgets.dart';
import 'session_screens.dart';

const _joinCodes = {
  'WOMEN_ONLY':
      'এটি শুধু নারীদের দল। প্রোফাইলে লিঙ্গ নারী দেওয়া থাকলে যোগ দেওয়া যায়।',
  'ALREADY_MEMBER': 'আপনি ইতিমধ্যে সদস্য, অথবা আপনার অনুরোধ অপেক্ষমাণ।',
};

const _groupFormCodes = {
  'WOMEN_ONLY':
      'শুধু নারীদের দল শুরু করতে প্রোফাইলে লিঙ্গ নারী দেওয়া থাকতে হয়।',
};

/// "12 members" in either language.
String memberCountText(BuildContext context, int count) =>
    '${KFormat.count(context, count)} '
    '${KaajLocalizations.text(context, 'জন সদস্য')}';

String membershipLabel(GroupMembership membership) {
  if (membership.active) return groupRoleLabel(membership.role);
  if (membership.pending) {
    return membership.invited ? 'আমন্ত্রণ এসেছে' : 'অনুরোধ অপেক্ষমাণ';
  }
  return 'সরানো হয়েছে';
}

class GroupCard extends StatelessWidget {
  const GroupCard({required this.group, super.key});

  final CommunityGroup group;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final membership = group.myMembership;
    return Card(
      key: ValueKey('group-${group.id}'),
      margin: EdgeInsets.zero,
      child: ListTile(
        onTap: () => context.push(CommunityPaths.group(group.id)),
        leading: const CircleAvatar(child: Icon(Icons.diversity_3_outlined)),
        title: Text(group.name, style: theme.textTheme.titleMedium),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              [
                memberCountText(context, group.memberCount),
                if (group.area != null) group.area!.nameFor(language),
                if (group.category != null) group.category!.nameFor(language),
              ].join(' · '),
            ),
            if (group.womenOnly || membership != null || group.isPrivate)
              Padding(
                padding: const EdgeInsets.only(top: KSpacing.xs),
                child: Wrap(
                  spacing: KSpacing.xs,
                  runSpacing: KSpacing.xs,
                  children: [
                    if (membership != null)
                      StatusPill(
                        membershipLabel(membership),
                        color: membership.active
                            ? KColors.success
                            : KColors.warning,
                      ),
                    if (group.womenOnly)
                      const StatusPill(
                        'শুধু নারীদের',
                        color: KColors.secondary,
                      ),
                    if (group.isPrivate) const StatusPill('ব্যক্তিগত'),
                  ],
                ),
              ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// My groups

class MyGroupsScreen extends ConsumerWidget {
  const MyGroupsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groups = ref.watch(myGroupsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('আমার দল'),
        actions: [
          IconButton(
            key: const ValueKey('group-new'),
            tooltip: KaajLocalizations.text(context, 'নতুন দল'),
            icon: const Icon(Icons.group_add_outlined),
            onPressed: () => context.push(CommunityPaths.newGroup),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myGroupsProvider);
          await ref
              .read(myGroupsProvider.future)
              .then<void>((_) {}, onError: (_) {});
        },
        child: CommunityAsync<List<CommunityGroup>>(
          value: groups,
          errorLabel: 'দলগুলো লোড করা যায়নি।',
          onRetry: () => ref.invalidate(myGroupsProvider),
          builder: (items) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(KSpacing.md),
            children: [
              if (items.isEmpty)
                KEmptyState(
                  icon: Icons.diversity_3_outlined,
                  title: 'আপনি কোনো দলে নেই',
                  message:
                      'খুঁজুন ও জানুন > কমিউনিটি থেকে দল খুঁজে যোগ দিন, অথবা নিজে একটি শুরু করুন।',
                  actionLabel: 'নতুন দল শুরু করুন',
                  onAction: () => context.push(CommunityPaths.newGroup),
                ),
              for (final group in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: KSpacing.sm),
                  child: GroupCard(group: group),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Detail

class GroupDetailScreen extends ConsumerStatefulWidget {
  const GroupDetailScreen({required this.groupId, super.key});

  final String groupId;

  @override
  ConsumerState<GroupDetailScreen> createState() => _GroupDetailScreenState();
}

class _GroupDetailScreenState extends ConsumerState<GroupDetailScreen> {
  bool _busy = false;

  String get _id => widget.groupId;

  void _refresh() {
    ref
      ..invalidate(groupProvider(_id))
      ..invalidate(myGroupsProvider)
      ..invalidate(groupSearchProvider);
  }

  Future<void> _join(CommunityGroup group) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final joined = await ref.read(communityRepositoryProvider).joinGroup(_id);
      _refresh();
      if (!mounted) return;
      showCommunitySnack(
        context,
        joined.myMembership?.pending ?? false
            ? 'অনুরোধ পাঠানো হয়েছে। মডারেটর অনুমোদন করলে জানানো হবে।'
            : 'আপনি দলে যোগ দিয়েছেন।',
      );
    } on Object catch (error) {
      if (mounted) {
        showCommunityFailure(
          context,
          error,
          'দলে যোগ দেওয়া যায়নি। আবার চেষ্টা করুন।',
          codes: _joinCodes,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _leave(GroupMembership membership) async {
    final title = membership.active
        ? 'দল ছেড়ে দেবেন?'
        : membership.invited
        ? 'আমন্ত্রণ ফিরিয়ে দেবেন?'
        : 'অনুরোধ তুলে নেবেন?';
    final ok = await confirmAction(
      context,
      title: title,
      message: membership.active
          ? 'আপনি আর দলের চ্যাট, ঘোষণা ও সেশন দেখতে পাবেন না।'
          : 'পরে আবার যোগ দিতে চাইতে পারবেন।',
      confirmLabel: 'হ্যাঁ',
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(communityRepositoryProvider).leaveGroup(_id);
      _refresh();
      if (mounted) showCommunitySnack(context, 'হয়ে গেছে।');
    } on Object catch (error) {
      if (mounted) {
        showCommunityFailure(
          context,
          error,
          'এটি করা যায়নি। আবার চেষ্টা করুন।',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _chat() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final id = await ref.read(communityRepositoryProvider).groupChat(_id);
      if (!mounted) return;
      if (id == null) {
        showCommunitySnack(context, 'চ্যাট এখন খোলা যাচ্ছে না।');
      } else {
        await context.push(AppRoutes.chatThread(id));
      }
    } on Object catch (error) {
      if (mounted) showCommunityFailure(context, error, 'চ্যাট খোলা যায়নি।');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(groupProvider(_id));
    final group = value.valueOrNull;
    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('দল'),
        actions: [
          if (group != null && group.isModerator)
            IconButton(
              key: const ValueKey('group-edit'),
              tooltip: KaajLocalizations.text(context, 'সম্পাদনা'),
              icon: const Icon(Icons.edit_outlined),
              onPressed: () => context.push(CommunityPaths.editGroup(_id)),
            ),
          if (group != null && !group.isModerator)
            IconButton(
              key: const ValueKey('group-report'),
              tooltip: KaajLocalizations.text(context, 'রিপোর্ট করুন'),
              icon: const Icon(Icons.flag_outlined),
              onPressed: () => context.push(AppRoutes.report('GROUP', _id)),
            ),
        ],
      ),
      body: CommunityAsync<CommunityGroup>(
        value: value,
        errorLabel: 'দলের তথ্য লোড করা যায়নি।',
        onRetry: () => ref.invalidate(groupProvider(_id)),
        builder: (item) => RefreshIndicator(
          onRefresh: () async {
            _refresh();
            await ref
                .read(groupProvider(_id).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: _body(context, item),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, CommunityGroup group) {
    final theme = Theme.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final membership = group.myMembership;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        Text(group.name, style: theme.textTheme.titleLarge),
        const SizedBox(height: KSpacing.xs),
        Wrap(
          spacing: KSpacing.xs,
          runSpacing: KSpacing.xs,
          children: [
            StatusPill(group.isPrivate ? 'ব্যক্তিগত' : 'সবার জন্য খোলা'),
            if (group.womenOnly)
              const StatusPill('শুধু নারীদের', color: KColors.secondary),
            if (group.status == 'HIDDEN')
              const StatusPill('লুকানো', color: KColors.danger),
            if (membership != null)
              StatusPill(
                membershipLabel(membership),
                color: membership.active ? KColors.success : KColors.warning,
              ),
          ],
        ),
        const Divider(height: KSpacing.lg),
        InfoRow(
          icon: Icons.groups_outlined,
          label: 'সদস্য',
          value: memberCountText(context, group.memberCount),
        ),
        if (group.area != null)
          InfoRow(
            icon: Icons.location_on_outlined,
            label: 'এলাকা',
            value: group.area!.nameFor(language),
          ),
        if (group.category != null)
          InfoRow(
            icon: Icons.work_outline,
            label: 'কাজের ধরন',
            value: group.category!.nameFor(language),
          ),
        if (group.description != null)
          InfoRow(icon: Icons.notes, label: 'বিবরণ', value: group.description!),
        if (group.womenOnly)
          Card(
            margin: const EdgeInsets.symmetric(vertical: KSpacing.sm),
            child: ListTile(
              leading: const Icon(Icons.female),
              title: const KLocalizedText(
                'শুধু নারীদের দল: যোগ দিতে প্রোফাইলে লিঙ্গ নারী দেওয়া থাকতে হয়, আর একজন মডারেটর অনুরোধ অনুমোদন করেন। সার্ভার এটি যাচাই করে।',
              ),
              trailing: TextButton(
                onPressed: () => context.push(AppRoutes.editProfile),
                child: const KLocalizedText('প্রোফাইল'),
              ),
            ),
          ),
        const SizedBox(height: KSpacing.md),
        ..._actions(context, group, membership),
      ],
    );
  }

  List<Widget> _actions(
    BuildContext context,
    CommunityGroup group,
    GroupMembership? membership,
  ) {
    const gap = SizedBox(height: KSpacing.sm);
    if (membership == null) {
      return [
        FilledButton(
          key: const ValueKey('group-join'),
          onPressed: _busy ? null : () => _join(group),
          child: KLocalizedText(
            group.womenOnly ? 'যোগ দেওয়ার অনুরোধ পাঠান' : 'দলে যোগ দিন',
          ),
        ),
      ];
    }
    if (membership.pending && membership.invited) {
      return [
        const KLocalizedText('এই দলে যোগ দিতে আপনাকে আমন্ত্রণ জানানো হয়েছে।'),
        gap,
        FilledButton(
          key: const ValueKey('group-accept-invite'),
          onPressed: _busy ? null : () => _join(group),
          child: const KLocalizedText('আমন্ত্রণ গ্রহণ করুন'),
        ),
        gap,
        OutlinedButton(
          key: const ValueKey('group-decline-invite'),
          onPressed: _busy ? null : () => _leave(membership),
          child: const KLocalizedText('ফিরিয়ে দিন'),
        ),
      ];
    }
    if (membership.pending) {
      return [
        const KLocalizedText(
          'আপনার যোগ দেওয়ার অনুরোধ অপেক্ষমাণ। মডারেটর অনুমোদন করলে জানানো হবে।',
        ),
        gap,
        OutlinedButton(
          key: const ValueKey('group-cancel-request'),
          onPressed: _busy ? null : () => _leave(membership),
          child: const KLocalizedText('অনুরোধ তুলে নিন'),
        ),
      ];
    }
    if (!membership.active) {
      return const [
        KLocalizedText('একজন মডারেটর আপনাকে এই দল থেকে সরিয়েছেন।'),
      ];
    }
    return [
      FilledButton.icon(
        key: const ValueKey('group-chat'),
        onPressed: _busy ? null : _chat,
        icon: const Icon(Icons.forum_outlined),
        label: const KLocalizedText('দলের চ্যাট'),
      ),
      gap,
      _LinkTile(
        key: const ValueKey('group-announcements'),
        icon: Icons.campaign_outlined,
        label: 'ঘোষণা',
        onTap: () => context.push(CommunityPaths.groupAnnouncements(_id)),
      ),
      _LinkTile(
        key: const ValueKey('group-sessions'),
        icon: Icons.event_outlined,
        label: 'দলের সেশন',
        onTap: () => context.push(CommunityPaths.groupSessions(_id)),
      ),
      _LinkTile(
        key: const ValueKey('group-members'),
        icon: Icons.groups_outlined,
        label: group.isModerator ? 'সদস্য ও অনুরোধ' : 'সদস্য',
        onTap: () => context.push(CommunityPaths.groupMembers(_id)),
      ),
      gap,
      TextButton(
        key: const ValueKey('group-leave'),
        onPressed: _busy ? null : () => _leave(membership),
        child: const KLocalizedText('দল ছেড়ে দিন'),
      ),
    ];
  }
}

class _LinkTile extends StatelessWidget {
  const _LinkTile({
    required this.icon,
    required this.label,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: KSpacing.xs),
    child: ListTile(
      leading: Icon(icon),
      title: KLocalizedText(label),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    ),
  );
}

// ---------------------------------------------------------------------------
// Create and edit

class GroupFormScreen extends ConsumerWidget {
  const GroupFormScreen({this.groupId, super.key});

  final String? groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(
      title: KLocalizedText(groupId == null ? 'নতুন দল' : 'দল সম্পাদনা'),
    ),
    body: groupId == null
        ? const _GroupForm()
        : CommunityAsync<CommunityGroup>(
            value: ref.watch(groupProvider(groupId!)),
            errorLabel: 'দলের তথ্য লোড করা যায়নি।',
            onRetry: () => ref.invalidate(groupProvider(groupId!)),
            builder: (group) => group.isModerator
                ? _GroupForm(existing: group)
                : const NotAvailableState(),
          ),
  );
}

class _GroupForm extends ConsumerStatefulWidget {
  const _GroupForm({this.existing});

  final CommunityGroup? existing;

  @override
  ConsumerState<_GroupForm> createState() => _GroupFormState();
}

class _GroupFormState extends ConsumerState<_GroupForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _description;
  late String _visibility;
  late bool _womenOnly;
  String? _areaId;
  String _areaName = '';
  String? _categoryId;
  bool _saving = false;
  String? _error;

  bool get _editing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final group = widget.existing;
    _name = TextEditingController(text: group?.name ?? '');
    _description = TextEditingController(text: group?.description ?? '');
    _visibility = group?.visibility ?? 'PUBLIC';
    _womenOnly = group?.womenOnly ?? false;
    _areaId = group?.area?.id;
    _categoryId = group?.category?.id;
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || !(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final draft = GroupDraft(
      name: _name.text,
      description: _description.text,
      visibility: _visibility,
      womenOnly: _womenOnly,
      locationId: _areaId,
      categoryId: _categoryId,
    );
    final repository = ref.read(communityRepositoryProvider);
    try {
      final saved = _editing
          ? await repository.updateGroup(widget.existing!.id, draft)
          : await repository.createGroup(draft);
      ref
        ..invalidate(groupProvider(saved.id))
        ..invalidate(myGroupsProvider)
        ..invalidate(groupSearchProvider);
      if (!mounted) return;
      if (_editing) {
        showCommunitySnack(context, 'দল সংরক্ষণ হয়েছে।');
        context.pop();
      } else {
        showCommunitySnack(context, 'দল তৈরি হয়েছে। আপনি এর মডারেটর।');
        context.pushReplacement(CommunityPaths.group(saved.id));
      }
    } on Object catch (error) {
      if (!mounted) return;
      setState(
        () => _error = communityFailureText(
          context,
          error,
          'দল সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
          codes: _groupFormCodes,
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
    final categories =
        ref.watch(categoryTreeProvider).valueOrNull ??
        const <CatalogCategory>[];
    final areaLabel = _areaName.isNotEmpty
        ? _areaName
        : widget.existing?.area?.nameFor(language) ?? '';
    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(KSpacing.md),
        children: [
          KTextField(
            key: const ValueKey('group-name'),
            label: 'দলের নাম',
            controller: _name,
            validator: (value) {
              final length = value?.trim().length ?? 0;
              return length < 3 || length > 80
                  ? '৩ থেকে ৮০ অক্ষরের মধ্যে লিখুন।'
                  : null;
            },
          ),
          const SizedBox(height: KSpacing.sm),
          KTextField(
            key: const ValueKey('group-description'),
            label: 'বিবরণ (ঐচ্ছিক)',
            controller: _description,
            maxLines: 4,
            minLines: 2,
            validator: (value) => (value?.trim().length ?? 0) > 1000
                ? 'সর্বোচ্চ ১০০০ অক্ষর লেখা যাবে।'
                : null,
          ),
          const SizedBox(height: KSpacing.md),
          KLocalizedText('কারা দেখতে পাবেন', style: theme.textTheme.titleSmall),
          SegmentedButton<String>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(
                value: 'PUBLIC',
                label: KLocalizedText('সবার জন্য খোলা'),
              ),
              ButtonSegment(
                value: 'PRIVATE',
                label: KLocalizedText('ব্যক্তিগত'),
              ),
            ],
            selected: {_visibility},
            onSelectionChanged: (value) =>
                setState(() => _visibility = value.first),
          ),
          KLocalizedText(
            _visibility == 'PUBLIC'
                ? 'যে কেউ দলটি খুঁজে পাবেন ও যোগ দিতে পারবেন।'
                : 'শুধু সদস্য ও আমন্ত্রিতরা দলটি দেখতে পান।',
            style: theme.textTheme.bodySmall,
          ),
          SwitchListTile(
            key: const ValueKey('group-women-only'),
            contentPadding: EdgeInsets.zero,
            value: _womenOnly,
            onChanged: _editing
                ? null
                : (value) => setState(() => _womenOnly = value),
            title: const KLocalizedText('শুধু নারীদের দল'),
            subtitle: KLocalizedText(
              _editing
                  ? 'দল তৈরির পরে এটি বদলানো যায় না।'
                  : 'আপনার ও সদস্যদের প্রোফাইলে লিঙ্গ নারী দেওয়া থাকতে হবে; সার্ভার এটি যাচাই করে। যোগ দেওয়ার অনুরোধ মডারেটর অনুমোদন করেন। পরে বদলানো যায় না।',
            ),
          ),
          Card(
            margin: const EdgeInsets.only(top: KSpacing.sm),
            child: ListTile(
              key: const ValueKey('group-area'),
              leading: const Icon(Icons.location_on_outlined),
              title: const KLocalizedText('এলাকা (ঐচ্ছিক)'),
              subtitle: areaLabel.isEmpty
                  ? const KLocalizedText('এখনো বেছে নেওয়া হয়নি')
                  : Text(areaLabel),
              trailing: _areaId == null
                  ? const KLocalizedText('বদলান')
                  : IconButton(
                      tooltip: KaajLocalizations.text(context, 'মুছুন'),
                      icon: const Icon(Icons.close),
                      onPressed: () => setState(() {
                        _areaId = null;
                        _areaName = '';
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
          const SizedBox(height: KSpacing.sm),
          DropdownButtonFormField<String?>(
            key: const ValueKey('group-category'),
            initialValue: categories.any((item) => item.id == _categoryId)
                ? _categoryId
                : null,
            decoration: InputDecoration(
              labelText: KaajLocalizations.text(context, 'কাজের ধরন (ঐচ্ছিক)'),
            ),
            items: [
              DropdownMenuItem<String?>(child: KLocalizedText('কোনোটি নয়')),
              for (final category in categories)
                DropdownMenuItem<String?>(
                  value: category.id,
                  child: Text(category.nameFor(language)),
                ),
            ],
            onChanged: (value) => setState(() => _categoryId = value),
          ),
          if (_error != null) ...[
            const SizedBox(height: KSpacing.sm),
            Text(
              _error!,
              key: const ValueKey('group-form-error'),
              style: const TextStyle(color: KColors.danger),
            ),
          ],
          const SizedBox(height: KSpacing.lg),
          FilledButton(
            key: const ValueKey('group-save'),
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : KLocalizedText(_editing ? 'সংরক্ষণ করুন' : 'দল শুরু করুন'),
          ),
          if (!_editing) ...[
            const SizedBox(height: KSpacing.sm),
            const KLocalizedText(
              'দল শুরু করতে পরিচয় যাচাই লাগে। একজন সর্বোচ্চ ৫টি দল শুরু করতে পারেন।',
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Announcements

class GroupAnnouncementsScreen extends ConsumerStatefulWidget {
  const GroupAnnouncementsScreen({required this.groupId, super.key});

  final String groupId;

  @override
  ConsumerState<GroupAnnouncementsScreen> createState() =>
      _GroupAnnouncementsScreenState();
}

class _GroupAnnouncementsScreenState
    extends ConsumerState<GroupAnnouncementsScreen> {
  final _body = TextEditingController();
  bool _posting = false;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _post() async {
    final text = _body.text.trim();
    if (_posting || text.length < 3 || text.length > 1000) return;
    setState(() => _posting = true);
    try {
      await ref
          .read(communityRepositoryProvider)
          .postAnnouncement(widget.groupId, text);
      _body.clear();
      ref.invalidate(groupAnnouncementsProvider(widget.groupId));
      if (mounted) {
        showCommunitySnack(
          context,
          'ঘোষণা পাঠানো হয়েছে। দলের চ্যাটেও দেখা যাবে।',
        );
      }
    } on Object catch (error) {
      if (mounted) {
        showCommunityFailure(
          context,
          error,
          'ঘোষণা পাঠানো যায়নি। আবার চেষ্টা করুন।',
        );
      }
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(groupAnnouncementsProvider(widget.groupId));
    final group = ref.watch(groupProvider(widget.groupId)).valueOrNull;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('ঘোষণা')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(groupAnnouncementsProvider(widget.groupId));
          await ref
              .read(groupAnnouncementsProvider(widget.groupId).future)
              .then<void>((_) {}, onError: (_) {});
        },
        child: CommunityAsync<List<GroupAnnouncement>>(
          value: list,
          errorLabel: 'ঘোষণা লোড করা যায়নি।',
          onRetry: () =>
              ref.invalidate(groupAnnouncementsProvider(widget.groupId)),
          builder: (items) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(KSpacing.md),
            children: [
              if (group?.canAnnounce ?? false) ...[
                TextField(
                  key: const ValueKey('announcement-body'),
                  controller: _body,
                  minLines: 2,
                  maxLines: 5,
                  maxLength: 1000,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    labelText: KaajLocalizations.text(
                      context,
                      'সব সদস্যের জন্য ঘোষণা',
                    ),
                  ),
                ),
                FilledButton(
                  key: const ValueKey('announcement-post'),
                  onPressed: _posting || _body.text.trim().length < 3
                      ? null
                      : _post,
                  child: const KLocalizedText('ঘোষণা পাঠান'),
                ),
                const Divider(height: KSpacing.lg),
              ],
              if (items.isEmpty)
                const KEmptyState(
                  icon: Icons.campaign_outlined,
                  title: 'এখনো কোনো ঘোষণা নেই',
                  message: 'মডারেটর ও অ্যাম্বাসেডরদের ঘোষণা এখানে দেখা যাবে।',
                ),
              for (final item in items)
                Card(
                  key: ValueKey('announcement-${item.id}'),
                  margin: const EdgeInsets.only(bottom: KSpacing.sm),
                  child: Padding(
                    padding: const EdgeInsets.all(KSpacing.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          [
                            item.postedBy.displayName,
                            if (item.createdAt != null)
                              KFormat.relativePast(context, item.createdAt!),
                          ].join(' · '),
                          style: theme.textTheme.labelMedium,
                        ),
                        const SizedBox(height: KSpacing.xs),
                        Text(item.body),
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

// ---------------------------------------------------------------------------
// Group sessions

class GroupSessionsScreen extends ConsumerWidget {
  const GroupSessionsScreen({required this.groupId, super.key});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(groupSessionsProvider(groupId));
    final group = ref.watch(groupProvider(groupId)).valueOrNull;
    final canCreate = group?.canAnnounce ?? false;
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('দলের সেশন')),
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              key: const ValueKey('group-session-new'),
              onPressed: () =>
                  context.push(CommunityPaths.newGroupSession(groupId)),
              icon: const Icon(Icons.add),
              label: const KLocalizedText('নতুন সেশন'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(groupSessionsProvider(groupId));
          await ref
              .read(groupSessionsProvider(groupId).future)
              .then<void>((_) {}, onError: (_) {});
        },
        child: CommunityAsync<List<CommunitySession>>(
          value: sessions,
          errorLabel: 'সেশনগুলো লোড করা যায়নি।',
          onRetry: () => ref.invalidate(groupSessionsProvider(groupId)),
          builder: (items) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              KSpacing.md,
              KSpacing.md,
              KSpacing.md,
              96,
            ),
            children: [
              if (items.isEmpty)
                KEmptyState(
                  icon: Icons.event_outlined,
                  title: 'এখনো কোনো সেশন নেই',
                  message: canCreate
                      ? 'দলের জন্য আলোচনা, কর্মশালা বা অনুষ্ঠান আয়োজন করুন।'
                      : 'মডারেটর বা অ্যাম্বাসেডর সেশন প্রকাশ করলে এখানে দেখা যাবে।',
                ),
              for (final session in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: KSpacing.sm),
                  child: SessionCard(session: session),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Search box text used for the group search: at least 2 characters.
String groupQuery(String text) {
  final trimmed = text.trim();
  return trimmed.length >= 2 ? trimmed : '';
}

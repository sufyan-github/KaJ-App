import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../profile/presentation/controllers/me_provider.dart';
import '../domain/community_models.dart';
import 'community_providers.dart';
import 'community_widgets.dart';

/// Members of a group. Moderators also see pending requests and
/// invitations, approve them, change roles, remove people and invite.
class GroupMembersScreen extends ConsumerStatefulWidget {
  const GroupMembersScreen({required this.groupId, super.key});

  final String groupId;

  @override
  ConsumerState<GroupMembersScreen> createState() => _GroupMembersScreenState();
}

class _GroupMembersScreenState extends ConsumerState<GroupMembersScreen> {
  String _status = 'ACTIVE';
  bool _busy = false;

  String get _id => widget.groupId;

  void _refresh() {
    ref
      ..invalidate(groupMembersProvider)
      ..invalidate(groupProvider(_id));
  }

  Future<void> _run(
    Future<void> Function() action,
    String done,
    String fallback,
  ) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      _refresh();
      if (mounted) showCommunitySnack(context, done);
    } on Object catch (error) {
      if (mounted) showCommunityFailure(context, error, fallback);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _invite() async {
    final userIds = await showPeoplePicker(context);
    if (userIds == null || userIds.isEmpty || !mounted) return;
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final invited = await ref
          .read(communityRepositoryProvider)
          .inviteToGroup(_id, userIds);
      _refresh();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              '${KFormat.count(context, invited.length)} '
              '${KaajLocalizations.text(context, 'জনকে আমন্ত্রণ পাঠানো হয়েছে।')}',
            ),
          ),
        );
    } on Object catch (error) {
      if (mounted) {
        showCommunityFailure(
          context,
          error,
          'আমন্ত্রণ পাঠানো যায়নি। আবার চেষ্টা করুন।',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(GroupMember member) async {
    final pending = member.status == 'PENDING';
    final ok = await confirmAction(
      context,
      title: pending
          ? (member.isRequest ? 'অনুরোধ নাকচ করবেন?' : 'আমন্ত্রণ বাতিল করবেন?')
          : 'সদস্যকে সরাবেন?',
      message: pending
          ? 'তিনি পরে আবার যোগ দিতে চাইতে পারবেন।'
          : 'সরানো সদস্য আর এই দলে যোগ দিতে পারবেন না।',
      confirmLabel: pending ? 'হ্যাঁ' : 'সরিয়ে দিন',
    );
    if (!ok || !mounted) return;
    await _run(
      () => ref
          .read(communityRepositoryProvider)
          .removeMember(_id, member.userId),
      'হয়ে গেছে।',
      'এটি করা যায়নি। আবার চেষ্টা করুন।',
    );
  }

  @override
  Widget build(BuildContext context) {
    final groupValue = ref.watch(groupProvider(_id));
    final group = groupValue.valueOrNull;
    final moderator = group?.isModerator ?? false;
    final status = moderator ? _status : 'ACTIVE';
    final me = ref.watch(meProvider).valueOrNull?.userId;
    final list = (groupId: _id, status: status);
    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('সদস্য'),
        actions: [
          if (moderator)
            IconButton(
              key: const ValueKey('members-invite'),
              tooltip: KaajLocalizations.text(context, 'মানুষকে আমন্ত্রণ'),
              icon: const Icon(Icons.person_add_alt),
              onPressed: _busy ? null : _invite,
            ),
        ],
      ),
      body: groupValue.hasError && isNotFound(groupValue.error!)
          ? const NotAvailableState()
          : CommunityPagedList<GroupMember>(
              key: ValueKey('members-$status'),
              provider: groupMembersProvider(list),
              fetchMore: (cursor) => ref
                  .read(communityRepositoryProvider)
                  .members(_id, status: status, cursor: cursor),
              loadMoreKey: const ValueKey('members-more'),
              errorLabel: 'সদস্যদের তালিকা লোড করা যায়নি।',
              header: [
                if (moderator)
                  Padding(
                    padding: const EdgeInsets.all(KSpacing.md),
                    child: SegmentedButton<String>(
                      showSelectedIcon: false,
                      segments: const [
                        ButtonSegment(
                          value: 'ACTIVE',
                          label: KLocalizedText('সদস্য'),
                        ),
                        ButtonSegment(
                          value: 'PENDING',
                          label: KLocalizedText('অপেক্ষমাণ'),
                        ),
                      ],
                      selected: {_status},
                      onSelectionChanged: (value) =>
                          setState(() => _status = value.first),
                    ),
                  ),
              ],
              empty: KEmptyState(
                icon: Icons.groups_outlined,
                title: status == 'PENDING'
                    ? 'কোনো অপেক্ষমাণ অনুরোধ নেই'
                    : 'কোনো সদস্য নেই',
                message: status == 'PENDING'
                    ? 'যোগ দেওয়ার অনুরোধ ও পাঠানো আমন্ত্রণ এখানে দেখা যাবে।'
                    : 'সদস্যরা যোগ দিলে এখানে দেখা যাবে।',
              ),
              itemBuilder: (context, member) => _MemberTile(
                member: member,
                isMe: member.userId == me,
                moderator: moderator,
                busy: _busy,
                onApprove: () => _run(
                  () => ref
                      .read(communityRepositoryProvider)
                      .approveMember(_id, member.userId),
                  'অনুরোধ অনুমোদন হয়েছে।',
                  'অনুমোদন করা যায়নি। আবার চেষ্টা করুন।',
                ),
                onRole: (role) => _run(
                  () => ref
                      .read(communityRepositoryProvider)
                      .setMemberRole(_id, member.userId, role),
                  'ভূমিকা বদলানো হয়েছে।',
                  'ভূমিকা বদলানো যায়নি। আবার চেষ্টা করুন।',
                ),
                onRemove: () => _remove(member),
              ),
            ),
    );
  }
}

class _MemberTile extends StatelessWidget {
  const _MemberTile({
    required this.member,
    required this.isMe,
    required this.moderator,
    required this.busy,
    required this.onApprove,
    required this.onRole,
    required this.onRemove,
  });

  final bool busy;
  final bool isMe;
  final GroupMember member;
  final bool moderator;
  final VoidCallback onApprove;
  final VoidCallback onRemove;
  final ValueChanged<String> onRole;

  @override
  Widget build(BuildContext context) {
    final pending = member.status == 'PENDING';
    return Card(
      key: ValueKey('member-${member.userId}'),
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.person_outline)),
        title: Text(
          isMe
              ? '${member.displayName} (${KaajLocalizations.text(context, 'আপনি')})'
              : member.displayName,
        ),
        subtitle: Wrap(
          spacing: KSpacing.xs,
          children: [
            if (pending)
              StatusPill(
                member.isRequest ? 'যোগ দিতে চান' : 'আমন্ত্রিত',
                color: KColors.warning,
              )
            else
              StatusPill(
                groupRoleLabel(member.role),
                color: member.role == 'MEMBER' ? KColors.info : KColors.success,
              ),
            if (member.joinedAt != null)
              Text(KFormat.date(context, member.joinedAt!)),
          ],
        ),
        trailing: !moderator
            ? null
            : pending
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (member.isRequest)
                    IconButton(
                      key: ValueKey('member-approve-${member.userId}'),
                      tooltip: KaajLocalizations.text(context, 'অনুমোদন করুন'),
                      onPressed: busy ? null : onApprove,
                      icon: const Icon(Icons.check_circle_outline),
                    ),
                  IconButton(
                    key: ValueKey('member-remove-${member.userId}'),
                    tooltip: KaajLocalizations.text(context, 'নাকচ করুন'),
                    onPressed: busy ? null : onRemove,
                    icon: const Icon(Icons.cancel_outlined),
                  ),
                ],
              )
            : PopupMenuButton<String>(
                key: ValueKey('member-menu-${member.userId}'),
                enabled: !busy,
                onSelected: (choice) =>
                    choice == 'REMOVE' ? onRemove() : onRole(choice),
                itemBuilder: (context) => [
                  for (final role in const [
                    'MEMBER',
                    'MODERATOR',
                    'AMBASSADOR',
                  ])
                    if (role != member.role)
                      PopupMenuItem(
                        value: role,
                        child: KLocalizedText(_roleAction(role)),
                      ),
                  if (!isMe)
                    const PopupMenuItem(
                      value: 'REMOVE',
                      child: KLocalizedText('দল থেকে সরিয়ে দিন'),
                    ),
                ],
              ),
      ),
    );
  }

  static String _roleAction(String role) => switch (role) {
    'MODERATOR' => 'মডারেটর করুন',
    'AMBASSADOR' => 'অ্যাম্বাসেডর করুন',
    _ => 'সাধারণ সদস্য করুন',
  };
}

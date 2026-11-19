import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import '../../profile/domain/public_worker_profile.dart';
import '../../profile/presentation/controllers/me_provider.dart';
import '../../profile/presentation/controllers/public_profile_provider.dart';
import '../domain/business_models.dart';
import 'business_providers.dart';
import 'business_widgets.dart';

/// The people of a business. Every member sees the list; the owner
/// invites, changes roles and removes.
class BusinessMembersScreen extends ConsumerStatefulWidget {
  const BusinessMembersScreen({required this.businessId, super.key});

  final String businessId;

  @override
  ConsumerState<BusinessMembersScreen> createState() =>
      _BusinessMembersScreenState();
}

class _BusinessMembersScreenState extends ConsumerState<BusinessMembersScreen> {
  final _busy = <String>{};

  String get _id => widget.businessId;

  Future<bool> _change(
    String userId,
    Future<List<BusinessMember>> Function() action,
    String failure,
  ) async {
    if (_busy.contains(userId)) return false;
    setState(() => _busy.add(userId));
    try {
      await action();
      ref.invalidate(businessMembersProvider(_id));
      ref.invalidate(businessDetailProvider(_id));
      return true;
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, failure);
      return false;
    } finally {
      if (mounted) setState(() => _busy.remove(userId));
    }
  }

  Future<void> _remove(BusinessMember member) async {
    final confirmed = await confirmBusinessAction(
      context,
      title: 'সদস্যকে সরাবেন?',
      message: 'তিনি আর এই ব্যবসার তথ্য দেখতে বা কাজ করতে পারবেন না।',
      confirm: 'সরিয়ে দিন',
    );
    if (!confirmed) return;
    await _change(
      member.userId,
      () =>
          ref.read(businessRepositoryProvider).removeMember(_id, member.userId),
      'সদস্যকে সরানো যায়নি।',
    );
  }

  Future<void> _invite(List<BusinessMember> current) async {
    final picked = await showModalBottomSheet<PublicWorkerProfile>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          _PersonPicker(exclude: {for (final member in current) member.userId}),
    );
    if (picked == null || !mounted) return;
    final role = await showDialog<BusinessRole>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: const KLocalizedText('কোন ভূমিকায় আমন্ত্রণ জানাবেন?'),
        children: [
          for (final role in BusinessRole.values)
            SimpleDialogOption(
              key: ValueKey('invite-role-${role.wire}'),
              onPressed: () => Navigator.pop(dialogContext, role),
              child: KLocalizedText(businessRoleLabel(role)),
            ),
        ],
      ),
    );
    if (role == null || !mounted) return;
    final sent = await _change(
      picked.id,
      () => ref
          .read(businessRepositoryProvider)
          .invite(_id, userId: picked.id, role: role),
      'আমন্ত্রণ পাঠানো যায়নি।',
    );
    if (sent && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: KLocalizedText(
            'আমন্ত্রণ পাঠানো হয়েছে। তিনি নোটিফিকেশন পাবেন।',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final business = ref.watch(businessDetailProvider(_id)).valueOrNull;
    final members = ref.watch(businessMembersProvider(_id));
    final isOwner = business?.isOwner ?? false;
    final myId = ref.watch(meProvider).valueOrNull?.userId;
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('সদস্য')),
      floatingActionButton: isOwner && !(business?.isSuspended ?? false)
          ? FloatingActionButton.extended(
              key: const ValueKey('member-invite'),
              onPressed: () => _invite(members.valueOrNull ?? const []),
              icon: const Icon(Icons.person_add_alt_1_outlined),
              label: const KLocalizedText('সদস্য আমন্ত্রণ'),
            )
          : null,
      body: members.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => BusinessLoadError(
          error: error,
          label: 'সদস্যদের তালিকা লোড করা যায়নি।',
          onRetry: () => ref.invalidate(businessMembersProvider(_id)),
        ),
        data: (items) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(businessMembersProvider(_id));
            await ref
                .read(businessMembersProvider(_id).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: items.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: const [
                    KEmptyState(
                      icon: Icons.groups_outlined,
                      title: 'এখনো কোনো সদস্য নেই',
                      message:
                          'মালিক কর্মী ও ম্যানেজারদের আমন্ত্রণ জানাতে পারেন।',
                    ),
                  ],
                )
              : ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(
                    KSpacing.md,
                    KSpacing.sm,
                    KSpacing.md,
                    KSpacing.xxl * 2,
                  ),
                  children: [
                    if (isOwner)
                      const Padding(
                        padding: EdgeInsets.only(bottom: KSpacing.sm),
                        child: KLocalizedText(
                          'ব্যবসায় অন্তত একজন মালিক থাকতে হয়। শেষ মালিককে সরানো বা তার ভূমিকা বদলানো যায় না।',
                        ),
                      ),
                    for (final member in items)
                      _MemberTile(
                        member: member,
                        isMe: member.userId == myId,
                        canManage: isOwner,
                        busy: _busy.contains(member.userId),
                        onRole: (role) => _change(
                          member.userId,
                          () => ref
                              .read(businessRepositoryProvider)
                              .changeRole(_id, member.userId, role),
                          'ভূমিকা বদলানো যায়নি।',
                        ),
                        onRemove: () => _remove(member),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _MemberTile extends StatelessWidget {
  const _MemberTile({
    required this.member,
    required this.isMe,
    required this.canManage,
    required this.busy,
    required this.onRole,
    required this.onRemove,
  });

  final BusinessMember member;
  final bool isMe;
  final bool canManage;
  final bool busy;
  final ValueChanged<BusinessRole> onRole;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final name = member.displayName.isEmpty
        ? KaajLocalizations.text(context, 'নাম দেওয়া হয়নি')
        : member.displayName;
    return Card(
      key: ValueKey('member-${member.userId}'),
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.person_outline)),
        title: Text(isMe ? _withYou(context, name) : name),
        subtitle: Wrap(
          spacing: KSpacing.xs,
          runSpacing: KSpacing.xs,
          children: [
            BusinessPill(businessRoleLabel(member.role)),
            if (member.isInvited)
              const BusinessPill('আমন্ত্রিত', color: KColors.warning),
          ],
        ),
        trailing: !canManage
            ? null
            : busy
            ? const SizedBox.square(
                dimension: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : PopupMenuButton<String>(
                key: ValueKey('member-menu-${member.userId}'),
                onSelected: (value) {
                  if (value == 'remove') {
                    onRemove();
                  } else {
                    final role = BusinessRole.tryParse(value);
                    if (role != null) onRole(role);
                  }
                },
                itemBuilder: (context) => [
                  for (final role in BusinessRole.values)
                    if (role != member.role)
                      PopupMenuItem(
                        value: role.wire,
                        child: Text(_makeRole(context, role)),
                      ),
                  PopupMenuItem(
                    value: 'remove',
                    child: KLocalizedText(
                      member.isInvited ? 'আমন্ত্রণ বাতিল করুন' : 'সরিয়ে দিন',
                      style: const TextStyle(color: KColors.danger),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

String _withYou(BuildContext context, String name) {
  final you = KaajLocalizations.text(context, 'আপনি');
  return '$name ($you)';
}

String _makeRole(BuildContext context, BusinessRole role) {
  final make = KaajLocalizations.text(context, 'ভূমিকা করুন:');
  final label = KaajLocalizations.text(context, businessRoleLabel(role));
  return '$make $label';
}

/// Picks a person from the worker directory, with a search box.
class _PersonPicker extends ConsumerStatefulWidget {
  const _PersonPicker({required this.exclude});

  final Set<String> exclude;

  @override
  ConsumerState<_PersonPicker> createState() => _PersonPickerState();
}

class _PersonPickerState extends ConsumerState<_PersonPicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final people = ref.watch(workerDirectoryProvider);
    final language = Localizations.localeOf(context).languageCode;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.8,
      maxChildSize: 0.95,
      builder: (context, controller) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            KLocalizedText(
              'কাকে আমন্ত্রণ জানাবেন?',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: KSpacing.sm),
            TextField(
              key: const ValueKey('member-search'),
              decoration: InputDecoration(
                labelText: KaajLocalizations.text(
                  context,
                  'নাম বা দক্ষতা খুঁজুন',
                ),
                prefixIcon: const Icon(Icons.search),
              ),
              onChanged: (value) => setState(() => _query = value),
            ),
            const SizedBox(height: KSpacing.sm),
            Expanded(
              child: people.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => RetryPanel(
                  error: error,
                  label: 'কর্মীর তালিকা লোড হয়নি।',
                  onRetry: () => ref.invalidate(workerDirectoryProvider),
                ),
                data: (all) {
                  final items = all
                      .where((person) => !widget.exclude.contains(person.id))
                      .where(
                        (person) => matchesSearch(_query, [
                          person.displayName,
                          for (final skill in person.skills) ...[
                            skill.nameBn,
                            skill.nameEn,
                          ],
                        ]),
                      )
                      .toList(growable: false);
                  if (items.isEmpty) {
                    return const Center(
                      child: KLocalizedText('কাউকে পাওয়া যায়নি।'),
                    );
                  }
                  return ListView.builder(
                    controller: controller,
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      final person = items[index];
                      return ListTile(
                        key: ValueKey('pick-${person.id}'),
                        leading: const CircleAvatar(
                          child: Icon(Icons.person_outline),
                        ),
                        title: Text(
                          person.displayName.isEmpty
                              ? KaajLocalizations.text(
                                  context,
                                  'নাম দেওয়া হয়নি',
                                )
                              : person.displayName,
                        ),
                        subtitle: Text(
                          [
                            ?person.areaNameFor(language),
                            ...person.skills
                                .take(2)
                                .map((skill) => skill.nameFor(language)),
                          ].join(' · '),
                        ),
                        onTap: () => Navigator.pop(context, person),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

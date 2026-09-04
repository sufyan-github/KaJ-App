import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failure.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/permissions/permission_gateway.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_empty_state.dart';
import '../../../../core/widgets/k_error_state.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../domain/app_notification.dart';
import '../controllers/notifications_providers.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({
    this.permissionGateway = const PermissionGateway(),
    super.key,
  });

  final PermissionGateway permissionGateway;

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen>
    with WidgetsBindingObserver {
  final Set<String> _updatingIds = <String>{};
  late Future<KPermissionStatus> _permissionStatus;
  NotificationGroup _selectedGroup = NotificationGroup.all;
  bool _markingAll = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _permissionStatus = _readPermissionStatus();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      setState(() {
        _permissionStatus = _readPermissionStatus();
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inbox = ref.watch(notificationsProvider);
    final hasUnread = inbox.maybeWhen(
      data: (value) => value.unreadCount > 0,
      orElse: () => false,
    );

    return Scaffold(
      appBar: AppBar(
        title: const KLocalizedText('নোটিফিকেশন'),
        actions: [
          if (hasUnread)
            IconButton(
              onPressed: _markingAll ? null : _markAllRead,
              tooltip: KaajLocalizations.text(context, 'সব পড়েছি'),
              icon: _markingAll
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.done_all),
            ),
          const SizedBox(width: KSpacing.sm),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(notificationsProvider.future),
        child: inbox.when(
          loading: () => const _LoadingList(),
          error: (error, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(KSpacing.lg),
            children: [
              const SizedBox(height: KSpacing.xxl),
              KErrorState(
                failure: _notificationFailure(error),
                retryLabel: 'আবার চেষ্টা করুন',
                onRetry: () => ref.invalidate(notificationsProvider),
              ),
            ],
          ),
          data: _buildInbox,
        ),
      ),
    );
  }

  Widget _buildInbox(NotificationInbox inbox) {
    final visibleItems = inbox.items
        .where(
          (item) =>
              _selectedGroup == NotificationGroup.all ||
              item.group == _selectedGroup,
        )
        .toList(growable: false);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        KSpacing.md,
        KSpacing.sm,
        KSpacing.md,
        KSpacing.xl,
      ),
      children: [
        FutureBuilder<KPermissionStatus>(
          future: _permissionStatus,
          builder: (context, snapshot) {
            if (!snapshot.hasData ||
                snapshot.data == KPermissionStatus.granted) {
              return const SizedBox.shrink();
            }
            return Padding(
              padding: const EdgeInsets.only(bottom: KSpacing.md),
              child: _PermissionBanner(
                onOpenSettings: _openNotificationSettings,
              ),
            );
          },
        ),
        _InboxSummary(unreadCount: inbox.unreadCount),
        const SizedBox(height: KSpacing.md),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: NotificationGroup.values
                .map(
                  (group) => Padding(
                    padding: const EdgeInsets.only(right: KSpacing.sm),
                    child: FilterChip(
                      label: KLocalizedText(_groupLabel(group)),
                      selected: _selectedGroup == group,
                      selectedColor: Color.alphaBlend(
                        KColors.primary.withValues(alpha: 0.12),
                        Theme.of(context).colorScheme.surface,
                      ),
                      checkmarkColor: KColors.primary,
                      side: BorderSide(
                        color: _selectedGroup == group
                            ? KColors.primary
                            : KColors.border,
                      ),
                      onSelected: (_) => setState(() => _selectedGroup = group),
                    ),
                  ),
                )
                .toList(growable: false),
          ),
        ),
        const SizedBox(height: KSpacing.md),
        if (visibleItems.isEmpty)
          KEmptyState(
            icon: Icons.notifications_none_outlined,
            title: inbox.items.isEmpty
                ? 'এখনো কোনো নোটিফিকেশন নেই'
                : 'এই ধরনের কোনো আপডেট নেই',
            message: inbox.items.isEmpty
                ? 'আবেদন, বুকিং, বার্তা ও যাচাইয়ের খবর এখানে দেখা যাবে।'
                : 'অন্য একটি বিভাগ বেছে দেখুন বা নিচে টেনে রিফ্রেশ করুন।',
          )
        else
          ..._groupedRows(visibleItems),
      ],
    );
  }

  List<Widget> _groupedRows(List<AppNotification> items) {
    final widgets = <Widget>[];
    DateTime? currentDay;
    for (final item in items) {
      final local = item.createdAt.toLocal();
      final day = DateTime(local.year, local.month, local.day);
      if (currentDay != day) {
        currentDay = day;
        widgets
          ..add(
            Padding(
              padding: EdgeInsets.only(
                top: widgets.isEmpty ? 0 : KSpacing.md,
                bottom: KSpacing.sm,
                left: KSpacing.xs,
              ),
              child: KLocalizedText(
                _dayLabel(day),
                style: Theme.of(
                  context,
                ).textTheme.labelLarge?.copyWith(color: KColors.textSecondary),
              ),
            ),
          )
          ..add(_notificationCard(item));
      } else {
        widgets
          ..add(const SizedBox(height: KSpacing.sm))
          ..add(_notificationCard(item));
      }
    }
    return widgets;
  }

  Widget _notificationCard(AppNotification item) {
    final isUpdating = _updatingIds.contains(item.id);
    final relativeTime = _relativeTime(item.createdAt.toLocal());
    final languageCode = Localizations.localeOf(context).languageCode;
    final title = item.titleFor(languageCode);
    final body = item.bodyFor(languageCode);
    final localizedRelativeTime = KaajLocalizations.text(context, relativeTime);
    return Semantics(
      button: true,
      label:
          '$title, $body, $localizedRelativeTime${item.isRead ? '' : ', ${KaajLocalizations.text(context, 'নতুন')}'}',
      child: Card(
        margin: EdgeInsets.zero,
        elevation: item.isRead ? 0 : 1,
        color: item.isRead
            ? Theme.of(context).colorScheme.surface
            : Color.alphaBlend(
                KColors.primary.withValues(alpha: 0.07),
                Theme.of(context).colorScheme.surface,
              ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: item.isRead
                ? KColors.border
                : KColors.primary.withValues(alpha: 0.25),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: isUpdating ? null : () => _openNotification(item),
          child: Padding(
            padding: const EdgeInsets.all(KSpacing.md),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _NotificationIcon(item: item),
                const SizedBox(width: KSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              title,
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(
                                    fontSize: 16,
                                    fontWeight: item.isRead
                                        ? FontWeight.w500
                                        : FontWeight.w700,
                                  ),
                            ),
                          ),
                          if (isUpdating)
                            const Padding(
                              padding: EdgeInsets.only(left: KSpacing.sm),
                              child: SizedBox.square(
                                dimension: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              ),
                            )
                          else if (!item.isRead)
                            Container(
                              width: 9,
                              height: 9,
                              margin: const EdgeInsets.only(
                                top: KSpacing.sm,
                                left: KSpacing.sm,
                              ),
                              decoration: const BoxDecoration(
                                color: KColors.primary,
                                shape: BoxShape.circle,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: KSpacing.xs),
                      Text(
                        body,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: KColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: KSpacing.sm),
                      Row(
                        children: [
                          const Icon(
                            Icons.schedule,
                            size: 16,
                            color: KColors.textSecondary,
                          ),
                          const SizedBox(width: KSpacing.xs),
                          Expanded(
                            child: KLocalizedText(
                              relativeTime,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: KColors.textSecondary),
                            ),
                          ),
                          if (item.route != null)
                            const Icon(
                              Icons.chevron_right,
                              color: KColors.textSecondary,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openNotification(AppNotification item) async {
    setState(() => _updatingIds.add(item.id));
    if (!item.isRead) {
      try {
        await ref.read(notificationsRepositoryProvider).markRead(item.id);
      } on Object {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: KLocalizedText(
                'পঠিত হিসেবে সংরক্ষণ করা যায়নি। পরে আবার চেষ্টা হবে।',
              ),
            ),
          );
        }
      } finally {
        ref.invalidate(notificationsProvider);
      }
    }
    if (!mounted) return;
    setState(() => _updatingIds.remove(item.id));

    if (item.route == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: KLocalizedText('এই আপডেটের আলাদা বিস্তারিত পৃষ্ঠা নেই।'),
        ),
      );
      return;
    }
    try {
      await context.push(item.route!);
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: KLocalizedText('আপডেটটির বিস্তারিত এখন খোলা যাচ্ছে না।'),
          ),
        );
      }
    }
  }

  Future<void> _markAllRead() async {
    setState(() => _markingAll = true);
    try {
      await ref.read(notificationsRepositoryProvider).markAllRead();
      ref.invalidate(notificationsProvider);
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: KLocalizedText(
              'সব নোটিফিকেশন পঠিত করা যায়নি। আবার চেষ্টা করুন।',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _markingAll = false);
    }
  }

  Future<KPermissionStatus> _readPermissionStatus() async {
    try {
      return await widget.permissionGateway.status(KPermission.notifications);
    } on Object {
      return KPermissionStatus.granted;
    }
  }

  Future<void> _openNotificationSettings() async {
    await widget.permissionGateway.openSettings();
  }
}

class _PermissionBanner extends StatelessWidget {
  const _PermissionBanner({required this.onOpenSettings});

  final VoidCallback onOpenSettings;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(KSpacing.md),
    decoration: BoxDecoration(
      color: Color.alphaBlend(
        KColors.warning.withValues(alpha: 0.10),
        Theme.of(context).colorScheme.surface,
      ),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: KColors.warning.withValues(alpha: 0.35)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.notifications_off_outlined, color: KColors.warning),
        const SizedBox(width: KSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              KLocalizedText(
                'ফোনের নোটিফিকেশন বন্ধ আছে',
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontSize: 16),
              ),
              const SizedBox(height: KSpacing.xs),
              KLocalizedText(
                'নতুন আবেদন, বুকিং বা বার্তার খবর পেতে ফোনের সেটিংসে অনুমতি দিন। ইনবক্স ব্যবহার করা যাবে।',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: KColors.textSecondary),
              ),
              const SizedBox(height: KSpacing.sm),
              TextButton.icon(
                onPressed: onOpenSettings,
                icon: const Icon(Icons.settings_outlined, size: 18),
                label: const KLocalizedText('সেটিংসে যান'),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _InboxSummary extends StatelessWidget {
  const _InboxSummary({required this.unreadCount});

  final int unreadCount;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(KSpacing.md),
    decoration: BoxDecoration(
      color: KColors.primary.withValues(alpha: 0.09),
      borderRadius: BorderRadius.circular(14),
    ),
    child: Row(
      children: [
        const Icon(Icons.notifications_active_outlined, color: KColors.primary),
        const SizedBox(width: KSpacing.md),
        Expanded(
          child: KLocalizedText(
            unreadCount == 0
                ? 'সব আপডেট পড়া হয়েছে'
                : '${_banglaNumber(unreadCount)}টি অপঠিত আপডেট আছে',
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}

class _NotificationIcon extends StatelessWidget {
  const _NotificationIcon({required this.item});

  final AppNotification item;

  @override
  Widget build(BuildContext context) => Container(
    width: 46,
    height: 46,
    decoration: BoxDecoration(
      color: _groupColor(item.group).withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Icon(_groupIcon(item.group), color: _groupColor(item.group)),
  );
}

class _LoadingList extends StatelessWidget {
  const _LoadingList();

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: const [
      SizedBox(height: 220),
      Center(child: CircularProgressIndicator()),
      SizedBox(height: KSpacing.md),
      Center(child: KLocalizedText('নোটিফিকেশন লোড হচ্ছে…')),
    ],
  );
}

String _groupLabel(NotificationGroup group) => switch (group) {
  NotificationGroup.all => 'সব',
  NotificationGroup.work => 'কাজ',
  NotificationGroup.application => 'আবেদনসমূহ',
  NotificationGroup.payment => 'পেমেন্ট',
  NotificationGroup.message => 'বার্তা',
  NotificationGroup.other => 'অন্যান্য',
};

IconData _groupIcon(NotificationGroup group) => switch (group) {
  NotificationGroup.all => Icons.notifications_outlined,
  NotificationGroup.work => Icons.work_outline,
  NotificationGroup.application => Icons.description_outlined,
  NotificationGroup.payment => Icons.payments_outlined,
  NotificationGroup.message => Icons.forum_outlined,
  NotificationGroup.other => Icons.info_outline,
};

Color _groupColor(NotificationGroup group) => switch (group) {
  NotificationGroup.payment => KColors.secondary,
  NotificationGroup.message => KColors.info,
  NotificationGroup.other => KColors.textSecondary,
  _ => KColors.primary,
};

String _dayLabel(DateTime day) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final difference = today.difference(day).inDays;
  if (difference == 0) return 'আজ';
  if (difference == 1) return 'গতকাল';
  const months = [
    'জানুয়ারি',
    'ফেব্রুয়ারি',
    'মার্চ',
    'এপ্রিল',
    'মে',
    'জুন',
    'জুলাই',
    'আগস্ট',
    'সেপ্টেম্বর',
    'অক্টোবর',
    'নভেম্বর',
    'ডিসেম্বর',
  ];
  return '${_banglaNumber(day.day)} ${months[day.month - 1]}, ${_banglaNumber(day.year)}';
}

String _relativeTime(DateTime time) {
  final difference = DateTime.now().difference(time);
  if (difference.isNegative || difference.inMinutes < 1) return 'এইমাত্র';
  if (difference.inMinutes < 60) {
    return '${_banglaNumber(difference.inMinutes)} মিনিট আগে';
  }
  if (difference.inHours < 24) {
    return '${_banglaNumber(difference.inHours)} ঘণ্টা আগে';
  }
  if (difference.inDays < 7) {
    return '${_banglaNumber(difference.inDays)} দিন আগে';
  }
  return _dayLabel(DateTime(time.year, time.month, time.day));
}

String _banglaNumber(int value) => value.toString().replaceAllMapped(
  RegExp(r'\d'),
  (match) => '০১২৩৪৫৬৭৮৯'[int.parse(match.group(0)!)],
);

Failure _notificationFailure(Object error) {
  final failure = error is Failure ? error : ErrorMapper.from(error);
  final message = switch (failure.kind) {
    FailureKind.network =>
      'ইন্টারনেট সংযোগ নেই। সংযোগ ঠিক করে আবার চেষ্টা করুন।',
    FailureKind.timeout =>
      'নোটিফিকেশন লোড হতে বেশি সময় লাগছে। আবার চেষ্টা করুন।',
    _ => 'নোটিফিকেশন লোড করা যায়নি। আবার চেষ্টা করুন।',
  };
  return Failure(
    kind: failure.kind,
    message: message,
    code: failure.code,
    field: failure.field,
    requestId: failure.requestId,
    retryable: failure.retryable,
  );
}

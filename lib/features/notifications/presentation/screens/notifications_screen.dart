import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_theme.dart';
import '../controllers/notifications_providers.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('নোটিফিকেশন')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(notificationsProvider.future),
        child: notifications.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => ListView(
            children: const [
              SizedBox(height: 180),
              Center(child: Text('নোটিফিকেশন লোড করা যায়নি।')),
            ],
          ),
          data: (items) => items.isEmpty
              ? ListView(
                  children: const [
                    SizedBox(height: 180),
                    Icon(Icons.notifications_none, size: 52),
                    Center(child: Text('এখনো কোনো নোটিফিকেশন নেই।')),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(KSpacing.md),
                  itemCount: items.length,
                  separatorBuilder: (_, _) =>
                      const SizedBox(height: KSpacing.sm),
                  itemBuilder: (context, index) {
                    final item = items[index];
                    return Card(
                      color: item.isRead
                          ? null
                          : KColors.primary.withValues(alpha: 0.08),
                      child: ListTile(
                        leading: Icon(
                          item.isRead
                              ? Icons.notifications_none
                              : Icons.notifications_active,
                          color: KColors.primary,
                        ),
                        title: Text(item.title),
                        subtitle: Text(item.body),
                        trailing: item.isRead
                            ? null
                            : const Badge(label: Text('নতুন')),
                        onTap: () async {
                          if (!item.isRead) {
                            await ref
                                .read(notificationsRepositoryProvider)
                                .markRead(item.id);
                            ref.invalidate(notificationsProvider);
                          }
                          if (context.mounted && item.route != null) {
                            await context.push(item.route!);
                          }
                        },
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../business_routes.dart';
import 'my_businesses_screen.dart';

/// My activity, Business: my businesses, invitations, collaboration.
class MyBusinessSection extends StatelessWidget {
  const MyBusinessSection({super.key});

  @override
  Widget build(BuildContext context) => MyBusinessesBody(
    header: [
      Card(
        child: Column(
          children: [
            _Link(
              key: const ValueKey('my-business-collaborations'),
              icon: Icons.handshake_outlined,
              title: 'সহযোগিতার অনুরোধ',
              subtitle: 'পাঠানো ও পাওয়া অনুরোধ',
              onTap: () => context.push(BusinessRoutes.collaborations),
            ),
            const Divider(height: 1),
            _Link(
              key: const ValueKey('my-business-partners'),
              icon: Icons.travel_explore_outlined,
              title: 'অংশীদার খুঁজুন',
              subtitle: 'যে ব্যবসাগুলো অংশীদার খুঁজছে',
              onTap: () => context.push(BusinessRoutes.partners),
            ),
            const Divider(height: 1),
            _Link(
              key: const ValueKey('my-business-create'),
              icon: Icons.add_business_outlined,
              title: 'ব্যবসা তৈরি করুন',
              subtitle: 'বিনামূল্যে, কোনো সাবস্ক্রিপশন লাগে না',
              onTap: () => context.push(BusinessRoutes.create),
            ),
          ],
        ),
      ),
      const SizedBox(height: KSpacing.sm),
    ],
  );
}

class _Link extends StatelessWidget {
  const _Link({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon, color: KColors.primary),
    title: KLocalizedText(title),
    subtitle: KLocalizedText(subtitle),
    trailing: const Icon(Icons.chevron_right),
    onTap: onTap,
  );
}

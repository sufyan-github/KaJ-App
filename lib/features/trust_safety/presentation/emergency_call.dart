import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../billing/presentation/billing_providers.dart';

/// Bangladesh emergency numbers. KAAJ is not an emergency service; these
/// open the phone dialer with the number filled in.
const emergencyNumbers = [
  (
    number: '999',
    title: 'জাতীয় জরুরি সেবা ৯৯৯',
    subtitle: 'পুলিশ, ফায়ার সার্ভিস ও অ্যাম্বুলেন্স। তাৎক্ষণিক বিপদে কল করুন।',
  ),
  (
    number: '109',
    title: 'নারী ও শিশু নির্যাতন প্রতিরোধ হেল্পলাইন ১০৯',
    subtitle: 'হয়রানি, পিছু নেওয়া বা সহিংসতার শিকার হলে বিনা খরচে কল করুন।',
  ),
];

/// Tappable 999 and 109 tiles.
class EmergencyCallTiles extends ConsumerWidget {
  const EmergencyCallTiles({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => Card(
    color: KColors.surfaceAlt,
    child: Column(
      children: [
        for (final item in emergencyNumbers)
          ListTile(
            key: ValueKey('call-${item.number}'),
            leading: const Icon(Icons.phone_in_talk, color: KColors.danger),
            title: KLocalizedText(item.title),
            subtitle: KLocalizedText(item.subtitle),
            trailing: const Icon(Icons.call_outlined),
            onTap: () => _call(context, ref, item.number),
          ),
      ],
    ),
  );

  Future<void> _call(BuildContext context, WidgetRef ref, String number) async {
    final opened = await ref.read(externalUriLauncherProvider)(
      Uri(scheme: 'tel', path: number),
    );
    if (opened || !context.mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            '${KaajLocalizations.text(context, 'ফোন অ্যাপ খোলা যায়নি। নিজে ডায়াল করুন:')} $number',
          ),
        ),
      );
  }
}

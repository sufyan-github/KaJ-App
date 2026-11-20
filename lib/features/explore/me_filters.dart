import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/k_localized_text.dart';
import '../profile/presentation/controllers/me_provider.dart';

/// Filter chips built from the signed-in person: "Near me" (their area)
/// and one chip per skill on their profile. Nothing shows while the
/// profile is loading or when it has no area and no skills.
class MeFilterChips extends ConsumerWidget {
  const MeFilterChips({
    required this.skillId,
    required this.locationId,
    required this.onSkill,
    required this.onLocation,
    this.keyPrefix = 'filter',
    super.key,
  });

  final String? skillId;
  final String? locationId;
  final ValueChanged<String?> onSkill;
  final ValueChanged<String?> onLocation;
  final String keyPrefix;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider).valueOrNull;
    if (me == null) return const SizedBox.shrink();
    final language = Localizations.localeOf(context).languageCode;
    final area = me.areaId;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (area != null)
          Padding(
            padding: const EdgeInsets.only(right: KSpacing.xs),
            child: FilterChip(
              key: ValueKey('$keyPrefix-near-me'),
              avatar: const Icon(Icons.near_me_outlined, size: 18),
              label: const KLocalizedText('আমার এলাকায়'),
              selected: locationId == area,
              onSelected: (on) => onLocation(on ? area : null),
            ),
          ),
        for (final skill in me.skills)
          if (skill.skillId.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: KSpacing.xs),
              child: FilterChip(
                key: ValueKey('$keyPrefix-skill-${skill.skillId}'),
                label: Text(
                  language == 'bn' || skill.nameEn.isEmpty
                      ? skill.nameBn
                      : skill.nameEn,
                ),
                selected: skillId == skill.skillId,
                onSelected: (on) => onSkill(on ? skill.skillId : null),
              ),
            ),
      ],
    );
  }
}

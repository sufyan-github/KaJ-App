import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../training_providers.dart';
import 'lesson_video_request.dart';

/// The smallest player the YouTube API terms allow.
const minimumPlayerSide = 200.0;

/// A lesson video, loaded only when the worker asks for it.
///
/// Nothing is fetched from YouTube until the button is pressed, and the
/// estimated data cost is shown first. If the video cannot play, the section
/// says so and points to the written notes, which always carry the lesson.
class LessonVideoSection extends ConsumerStatefulWidget {
  const LessonVideoSection({
    required this.videoId,
    required this.estimatedDataMb,
    super.key,
  });

  final int estimatedDataMb;
  final String videoId;

  @override
  ConsumerState<LessonVideoSection> createState() => _LessonVideoSectionState();
}

class _LessonVideoSectionState extends ConsumerState<LessonVideoSection> {
  bool _loaded = false;
  bool _failed = false;

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return const _Notice(
        icon: Icons.videocam_off_outlined,
        color: KColors.warning,
        message: 'এই ভিডিওটি পাওয়া যাচ্ছে না — নিচের নোট পড়ুন',
      );
    }
    if (_loaded) {
      final builder = ref.watch(lessonVideoBuilderProvider);
      return LayoutBuilder(
        builder: (context, constraints) {
          final width = math.max(minimumPlayerSide, constraints.maxWidth);
          final height = math.max(minimumPlayerSide, width * 9 / 16);
          return SizedBox(
            key: const ValueKey('lesson-player'),
            width: width,
            height: height,
            child: builder(
              context,
              LessonVideoRequest(
                videoId: widget.videoId,
                languageCode: Localizations.localeOf(context).languageCode,
                onError: (_) {
                  if (mounted) setState(() => _failed = true);
                },
              ),
            ),
          );
        },
      );
    }
    final onMobileData = ref
        .watch(onMobileDataProvider)
        .maybeWhen(data: (value) => value, orElse: () => false);
    final english = KaajLocalizations.isEnglish(context);
    final megabytes = KFormat.count(context, widget.estimatedDataMb);
    return Container(
      padding: const EdgeInsets.all(KSpacing.md),
      decoration: BoxDecoration(
        color: KColors.surfaceAlt,
        borderRadius: BorderRadius.circular(KRadius.md),
        border: Border.all(color: KColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.ondemand_video_outlined, color: KColors.primary),
              const SizedBox(width: KSpacing.sm),
              Expanded(
                child: Text(
                  english
                      ? 'This video uses about $megabytes MB of data.'
                      : 'এই ভিডিওতে প্রায় $megabytes MB ডেটা লাগবে।',
                ),
              ),
            ],
          ),
          if (onMobileData) ...[
            const SizedBox(height: KSpacing.sm),
            const _Notice(
              icon: Icons.signal_cellular_alt_rounded,
              color: KColors.warning,
              message:
                  'আপনি মোবাইল ডেটায় আছেন। চাইলে Wi-Fi পেলে ভিডিওটি দেখুন।',
            ),
          ],
          const SizedBox(height: KSpacing.sm),
          const KLocalizedText(
            'ভিডিও দেখা ঐচ্ছিক। নিচের নোট পড়েও পরীক্ষা দিতে পারবেন।',
            style: TextStyle(color: KColors.textSecondary),
          ),
          const SizedBox(height: KSpacing.sm),
          OutlinedButton.icon(
            onPressed: () => setState(() => _loaded = true),
            icon: const Icon(Icons.play_circle_outline),
            label: const KLocalizedText('ভিডিও চালু করুন'),
          ),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({
    required this.icon,
    required this.color,
    required this.message,
  });

  final Color color;
  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Container(
      padding: const EdgeInsets.all(KSpacing.sm),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .10),
        borderRadius: BorderRadius.circular(KRadius.sm),
        border: Border.all(color: color.withValues(alpha: .4)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: KSpacing.sm),
          Expanded(child: KLocalizedText(message)),
        ],
      ),
    ),
  );
}

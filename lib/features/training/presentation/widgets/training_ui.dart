import 'package:flutter/material.dart';

import '../../../../core/errors/failure.dart';
import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../data/training_repository.dart';
import '../../domain/training_models.dart';

/// The only evidence wording a certificate may carry. It states exactly what
/// was checked, and nothing more.
const knowledgeTestedWording = 'Kaaj জ্ঞান পরীক্ষায় উত্তীর্ণ';
const notALicenceWording = 'এটি কোনো লাইসেন্স নয়';

String languageOf(BuildContext context) =>
    Localizations.localeOf(context).languageCode;

/// When the daily test limit lifts, in the reader language.
String attemptLimitMessage(BuildContext context, DateTime? nextAttemptAt) {
  final english = KaajLocalizations.isEnglish(context);
  if (nextAttemptAt == null) {
    return english
        ? 'You have used today’s three tries. Please try again tomorrow.'
        : 'আজকের তিনটি চেষ্টা শেষ হয়েছে। আগামীকাল আবার চেষ্টা করুন।';
  }
  final when = KFormat.dateTime(context, nextAttemptAt);
  return english
      ? 'You have used today’s three tries. You can try again after $when.'
      : 'আজকের তিনটি চেষ্টা শেষ হয়েছে। $when-এর পরে আবার চেষ্টা করতে পারবেন।';
}

/// User-facing wording for a training request that did not go through.
String trainingFailureMessage(BuildContext context, Object error) {
  if (error is TrainingAttemptLimitFailure) {
    return attemptLimitMessage(context, error.nextAttemptAt);
  }
  final failure = error is Failure ? error : null;
  final key = switch (failure?.code) {
    trainingAlreadyCertifiedCode => 'এই কোর্সের সার্টিফিকেট আপনার আগেই আছে।',
    _ => switch (failure?.kind) {
      FailureKind.conflict =>
        'এই পরীক্ষার সময় শেষ হয়েছে বা আগেই জমা হয়েছে। নতুন করে শুরু করুন।',
      FailureKind.notFound => 'এই কোর্সটি এখন পাওয়া যাচ্ছে না।',
      FailureKind.network || FailureKind.timeout =>
        'ইন্টারনেট সংযোগ নেই। সংযোগ ঠিক করে আবার চেষ্টা করুন।',
      _ => 'অনুরোধটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।',
    },
  };
  return KaajLocalizations.text(context, key);
}

class CourseMetaLine extends StatelessWidget {
  const CourseMetaLine({required this.course, super.key});

  final CourseSummary course;

  @override
  Widget build(BuildContext context) {
    final english = KaajLocalizations.isEnglish(context);
    final minutes = KFormat.count(context, course.minutes);
    final megabytes = KFormat.count(context, course.estDataMb);
    return Wrap(
      spacing: KSpacing.sm,
      runSpacing: KSpacing.xs,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        _MetaChip(
          icon: Icons.schedule_outlined,
          label: english ? '$minutes min' : '$minutes মিনিট',
        ),
        _MetaChip(
          icon: Icons.data_usage_rounded,
          label: english
              ? 'about $megabytes MB data'
              : 'প্রায় $megabytes MB ডেটা',
        ),
        if (course.isSafetyCritical)
          _MetaChip(
            icon: Icons.health_and_safety_outlined,
            label: KaajLocalizations.text(context, 'নিরাপত্তা বিষয়ক'),
            color: KColors.warning,
          ),
      ],
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label, this.color});

  final Color? color;
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 16, color: color ?? KColors.textSecondary),
      const SizedBox(width: KSpacing.xs),
      Text(
        label,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: color),
      ),
    ],
  );
}

/// Shows whether a course already has a certificate. There is no state for
/// lessons watched: only passing the test produces anything.
class CertificateStateLine extends StatelessWidget {
  const CertificateStateLine({required this.course, super.key});

  final CourseSummary course;

  @override
  Widget build(BuildContext context) {
    final certificate = course.certificate;
    if (certificate != null && certificate.isValid) {
      final english = KaajLocalizations.isEnglish(context);
      final date = KFormat.date(context, certificate.issuedAt);
      return Row(
        children: [
          const Icon(Icons.verified_outlined, size: 18, color: KColors.success),
          const SizedBox(width: KSpacing.xs),
          Expanded(
            child: Text(
              english
                  ? 'Passed the Kaaj knowledge test · $date'
                  : '$knowledgeTestedWording · $date',
              style: const TextStyle(color: KColors.success),
            ),
          ),
        ],
      );
    }
    return const Row(
      children: [
        Icon(
          Icons.radio_button_unchecked,
          size: 18,
          color: KColors.textSecondary,
        ),
        SizedBox(width: KSpacing.xs),
        Expanded(
          child: KLocalizedText(
            'পরীক্ষা এখনো দেওয়া হয়নি',
            style: TextStyle(color: KColors.textSecondary),
          ),
        ),
      ],
    );
  }
}

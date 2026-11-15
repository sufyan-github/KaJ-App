import 'package:flutter/material.dart';

import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../domain/job_models.dart';

/// Asks for an overall rating plus the four sub-scores the API stores.
///
/// Each sub-score follows the overall rating until the person changes it,
/// so a quick review is still one tap, but a "late but good work" review is
/// possible. Returns null when dismissed.
class ReviewDialog extends StatefulWidget {
  const ReviewDialog({super.key});

  @override
  State<ReviewDialog> createState() => _ReviewDialogState();
}

enum _Aspect { punctuality, quality, communication, reliability }

class _ReviewDialogState extends State<ReviewDialog> {
  int _rating = 5;
  final _scores = <_Aspect, int>{};
  final _comment = TextEditingController();

  static const _labels = {
    _Aspect.punctuality: 'সময়ানুবর্তিতা',
    _Aspect.quality: 'কাজের মান',
    _Aspect.communication: 'যোগাযোগ',
    _Aspect.reliability: 'নির্ভরযোগ্যতা',
  };

  int _score(_Aspect aspect) => _scores[aspect] ?? _rating;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const KLocalizedText('অভিজ্ঞতা কেমন ছিল?'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _StarRow(
            label: 'সামগ্রিক রেটিং',
            value: _rating,
            size: 32,
            onChanged: (value) => setState(() => _rating = value),
          ),
          const SizedBox(height: KSpacing.sm),
          for (final aspect in _Aspect.values)
            _StarRow(
              label: _labels[aspect]!,
              value: _score(aspect),
              size: 24,
              onChanged: (value) => setState(() => _scores[aspect] = value),
            ),
          TextField(
            controller: _comment,
            maxLength: 1000,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: KaajLocalizations.text(context, 'মন্তব্য (ঐচ্ছিক)'),
              hintText: KaajLocalizations.text(
                context,
                'সময়, কাজের মান ও যোগাযোগ সম্পর্কে লিখুন',
              ),
            ),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const KLocalizedText('ফিরুন'),
      ),
      FilledButton(
        onPressed: () => Navigator.pop(
          context,
          ReviewInput(
            rating: _rating,
            punctuality: _score(_Aspect.punctuality),
            quality: _score(_Aspect.quality),
            communication: _score(_Aspect.communication),
            reliability: _score(_Aspect.reliability),
            comment: _comment.text,
          ),
        ),
        child: const KLocalizedText('জমা দিন'),
      ),
    ],
  );
}

class _StarRow extends StatelessWidget {
  const _StarRow({
    required this.label,
    required this.value,
    required this.size,
    required this.onChanged,
  });

  final String label;
  final int value;
  final double size;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final name = KaajLocalizations.text(context, label);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        KLocalizedText(label, style: Theme.of(context).textTheme.labelLarge),
        Wrap(
          children: List.generate(5, (index) {
            final stars = index + 1;
            final count = KFormat.count(context, stars);
            // A screen reader hears "Quality: 4 of 5", not "button" five times.
            final tooltip = language == 'en'
                ? '$name: $count of 5'
                : '$name: ৫-এর মধ্যে $count';
            return IconButton(
              tooltip: tooltip,
              visualDensity: VisualDensity.compact,
              iconSize: size,
              isSelected: stars <= value,
              onPressed: () => onChanged(stars),
              icon: Icon(
                stars <= value ? Icons.star_rounded : Icons.star_border_rounded,
                color: Colors.amber.shade700,
              ),
            );
          }),
        ),
      ],
    );
  }
}

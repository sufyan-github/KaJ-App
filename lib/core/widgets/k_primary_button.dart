import 'package:flutter/material.dart';

import '../localization/kaaj_localizations.dart';
import 'k_localized_text.dart';

class KPrimaryButton extends StatelessWidget {
  const KPrimaryButton({
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: KaajLocalizations.text(context, label),
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isLoading) ...[
              const SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 10),
            ],
            Flexible(child: KLocalizedText(label)),
          ],
        ),
      ),
    );
  }
}

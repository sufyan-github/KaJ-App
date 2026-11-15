import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../localization/kaaj_localizations.dart';
import '../widgets/k_error_message.dart';
import 'error_mapper.dart';

/// What to tell the person when an action failed.
///
/// A stable server code the app knows ("subscription required", "already
/// applied", "account restricted", a block, no internet) gets its own
/// Bangla or English message. Anything else keeps the screen's own
/// [fallback] line, which is a Bangla catalog key as everywhere else.
String failureText(BuildContext context, Object error, String fallback) {
  final known = serverCodeMessage(
    AppLocalizations.of(context),
    ErrorMapper.from(error),
  );
  return known ?? KaajLocalizations.text(context, fallback);
}

/// Shows [failureText] in a snack bar.
void showFailureSnack(BuildContext context, Object error, String fallback) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(content: Text(failureText(context, error, fallback))),
    );
}

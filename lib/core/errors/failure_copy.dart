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
/// [fallback] line, which is a Bangla catalog key as everywhere else, and
/// adds the server's reason and code under it so the person (and support)
/// can see why it was refused.
String failureText(BuildContext context, Object error, String fallback) {
  final failure = ErrorMapper.from(error);
  final known = serverCodeMessage(AppLocalizations.of(context), failure);
  if (known != null) return known;
  final line = KaajLocalizations.text(context, fallback);
  final reason = failure.serverReason(
    bangla: !KaajLocalizations.isEnglish(context),
  );
  return reason == null ? line : '$line\n$reason';
}

/// Shows [failureText] in a snack bar.
void showFailureSnack(BuildContext context, Object error, String fallback) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(content: Text(failureText(context, error, fallback))),
    );
}

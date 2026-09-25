import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import 'money.dart';

/// Every user-visible number and date in the app goes through here.
///
/// Formatters were previously constructed ad hoc with no locale argument, so
/// a Bangla screen printed "5 Sep 2026, 9:41 AM" in English, and relative
/// times were produced by substring-replacing Bangla words. Passing the active
/// locale to `intl` fixes both, and gives Bangla its own numerals for free.
abstract final class KFormat {
  static const _takaSign = '৳'; // ৳

  static String _language(BuildContext context) =>
      Localizations.localeOf(context).languageCode;

  // ---------------------------------------------------------------- money --

  /// `৳1,200` — or `৳1,200.50` when the amount is not a whole taka.
  static String money(BuildContext context, Money amount) =>
      moneyForLanguage(_language(context), amount);

  static String moneyForLanguage(String languageCode, Money amount) {
    final locale = _intlLocale(languageCode);
    final pattern = amount.fractionalPoisha == 0 ? '#,##0' : '#,##0.00';
    final value = amount.poisha / 100;
    return '$_takaSign${NumberFormat(pattern, locale).format(value)}';
  }

  /// Renders a range, collapsing it when both ends are equal or one is absent.
  static String? moneyRange(BuildContext context, Money? min, Money? max) {
    if (min == null && max == null) return null;
    if (min == null) return money(context, max!);
    if (max == null || max == min) return money(context, min);
    return '${money(context, min)} – ${money(context, max)}';
  }

  // ----------------------------------------------------------------- count --

  /// Digits in the reader's own numeral system.
  static String count(BuildContext context, num value) =>
      NumberFormat.decimalPattern(
        _intlLocale(_language(context)),
      ).format(value);

  // ------------------------------------------------------------------ time --

  /// `5 Sep 2026, 9:41 AM` / `৫ সেপ ২০২৬, ৯:৪১ AM`
  static String dateTime(BuildContext context, DateTime value) =>
      DateFormat.yMMMd(
        _intlLocale(_language(context)),
      ).add_jm().format(value.toLocal());

  static String date(BuildContext context, DateTime value) =>
      DateFormat.yMMMd(_intlLocale(_language(context))).format(value.toLocal());

  static String time(BuildContext context, DateTime value) =>
      DateFormat.jm(_intlLocale(_language(context))).format(value.toLocal());

  /// A short weekday plus time, for job schedules.
  static String dayAndTime(BuildContext context, DateTime value) {
    final locale = _intlLocale(_language(context));
    final local = value.toLocal();
    return '${DateFormat.MMMEd(locale).format(local)}, '
        '${DateFormat.jm(locale).format(local)}';
  }

  /// "3 hours ago" / "৩ ঘণ্টা আগে", pluralised properly in both languages.
  static String relativePast(BuildContext context, DateTime value) {
    final isBangla = _language(context) == 'bn';
    final elapsed = DateTime.now().difference(value.toLocal());
    if (elapsed.inSeconds < 60) {
      return isBangla ? 'এইমাত্র' : 'Just now';
    }
    final String amount;
    if (elapsed.inMinutes < 60) {
      amount = _unit(context, elapsed.inMinutes, 'minute', 'minutes', 'মিনিট');
    } else if (elapsed.inHours < 24) {
      amount = _unit(context, elapsed.inHours, 'hour', 'hours', 'ঘণ্টা');
    } else if (elapsed.inDays < 30) {
      amount = _unit(context, elapsed.inDays, 'day', 'days', 'দিন');
    } else {
      return date(context, value);
    }
    return isBangla ? '$amount আগে' : '$amount ago';
  }

  /// "in 2 days" / "২ দিন বাকি", for evidence and response deadlines.
  static String remaining(BuildContext context, Duration left) {
    final isBangla = _language(context) == 'bn';
    if (left.isNegative || left == Duration.zero) {
      return isBangla ? 'সময় শেষ' : 'Time is up';
    }
    final String amount;
    if (left.inHours < 1) {
      amount = _unit(context, left.inMinutes, 'minute', 'minutes', 'মিনিট');
    } else if (left.inDays < 1) {
      amount = _unit(context, left.inHours, 'hour', 'hours', 'ঘণ্টা');
    } else {
      amount = _unit(context, left.inDays, 'day', 'days', 'দিন');
    }
    return isBangla ? '$amount বাকি' : '$amount left';
  }

  static String _unit(
    BuildContext context,
    int value,
    String one,
    String many,
    String bangla,
  ) {
    final digits = count(context, value);
    if (_language(context) == 'bn') return '$digits $bangla';
    return '$digits ${value == 1 ? one : many}';
  }

  /// `intl` wants a full locale tag; the app only stores a language code.
  static String _intlLocale(String languageCode) =>
      languageCode == 'bn' ? 'bn_BD' : 'en';
}

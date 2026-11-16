import 'package:flutter/services.dart';

const _banglaDigits = '০১২৩৪৫৬৭৮৯';

/// Bangla digits (০–৯) as Latin digits (0–9). Each Bangla digit is one
/// UTF-16 unit, so lengths and cursor positions do not change.
String latinDigits(String value) {
  final buffer = StringBuffer();
  for (final unit in value.runes) {
    final index = _banglaDigits.indexOf(String.fromCharCode(unit));
    buffer.write(index >= 0 ? '$index' : String.fromCharCode(unit));
  }
  return buffer.toString();
}

/// Lets numeric fields accept a Bangla keyboard (Gboard's Bangla layout
/// types ০–৯): the digits are converted instead of being dropped by a
/// digits-only filter or failing to parse.
class LatinDigitsFormatter extends TextInputFormatter {
  const LatinDigitsFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final text = latinDigits(newValue.text);
    return text == newValue.text ? newValue : newValue.copyWith(text: text);
  }
}

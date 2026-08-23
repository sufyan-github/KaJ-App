import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('English localization avoids banned generic failure copy', () async {
    final contents = await File('lib/l10n/app_en.arb').readAsString();
    const banned = ['Something went wrong', 'Error', 'Failed', 'Invalid input'];

    for (final phrase in banned) {
      expect(contents, isNot(contains(phrase)), reason: 'Banned copy: $phrase');
    }
  });
}

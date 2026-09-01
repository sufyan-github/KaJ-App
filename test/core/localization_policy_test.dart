import 'dart:convert';
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

  test('Bangla localization contains every English message key', () async {
    final english =
        jsonDecode(await File('lib/l10n/app_en.arb').readAsString())
            as Map<String, dynamic>;
    final bangla =
        jsonDecode(await File('lib/l10n/app_bn.arb').readAsString())
            as Map<String, dynamic>;
    final messageKeys = english.keys.where((key) => !key.startsWith('@'));

    for (final key in messageKeys) {
      expect(bangla[key], isA<String>(), reason: 'Missing Bangla copy: $key');
      expect((bangla[key] as String).trim(), isNotEmpty);
    }
  });
}

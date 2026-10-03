import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/localization/generated_translation_catalog.dart';
import 'package:kaaj/core/localization/kaaj_localizations.dart';

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

  test('generated English UI copy contains no Bangla characters', () {
    final bangla = RegExp(r'[\u0980-\u09FF]');
    for (final entry in generatedEnglishTranslations.entries) {
      expect(
        entry.value,
        isNot(matches(bangla)),
        reason: 'Untranslated English copy for: ${entry.key}',
      );
    }
  });

  test('dynamic marketplace messages localize without mixed scripts', () {
    final bangla = RegExp(r'[\u0980-\u09FF]');
    const messages = [
      '★ 0 · 0 কাজ',
      '★ ৪.৯ · ৩২ কাজ',
      '২টি অপঠিত আপডেট আছে',
      '৩টি উপধরন',
      'পোস্টের সময়: ৫ সেপ্টেম্বর',
      'চলমান সময় ২ ঘণ্টা ১৫ মিনিট',
      'সার্ভার নির্ধারিত কাজের সময়: ৪৫ মিনিট',
      'লোকেশন যথেষ্ট নির্ভুল নয় (২৫০ মিটার)। খোলা জায়গায় গিয়ে আবার চেষ্টা করুন।',
      'অনুমোদিত দূরত্ব ৩০০ মিটার · চেক-ইন ৫০ মিটার দূরে',
      'কেন প্রত্যাখ্যাত: Image is blurry\nনথি পরিষ্কার করে আবার জমা দিন।',
    ];

    for (final message in messages) {
      expect(
        KaajLocalizations.forLanguage('en', message),
        isNot(matches(bangla)),
        reason: message,
      );
    }
  });

  test('authored job content is preserved instead of partly translated', () {
    const description =
        'অষ্টম শ্রেণির একজন শিক্ষার্থীকে সপ্তাহে ৪ দিন গণিত ও ইংরেজি পড়াতে হবে।';
    expect(KaajLocalizations.forLanguage('en', description), description);
  });

  test('static Bangla feature copy has an English rendering', () async {
    final bangla = RegExp(r'[\u0980-\u09FF]');
    final stringLiteral = RegExp(r"'([^'\\]*(?:\\.[^'\\]*)*)'");
    final featureFiles = Directory('lib/features')
        .listSync(recursive: true)
        .whereType<File>()
        .where((file) => file.path.endsWith('.dart'));

    for (final file in featureFiles) {
      final contents = await file.readAsString();
      for (final match in stringLiteral.allMatches(contents)) {
        final source = match.group(1)!;
        if (!bangla.hasMatch(source) ||
            source.contains(r'$') ||
            RegExp(r'^[০-৯]+$').hasMatch(source)) {
          continue;
        }
        final rendered = KaajLocalizations.forLanguage('en', source);
        expect(
          rendered,
          isNot(matches(bangla)),
          reason: 'Untranslated static feature copy in ${file.path}: $source',
        );
      }
    }
  });
}

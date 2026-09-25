import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:kaaj/core/formatting/kaaj_format.dart';
import 'package:kaaj/core/formatting/money.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('bn_BD');
    await initializeDateFormatting('en');
  });

  group('Money', () {
    test('parses the wire formats the API actually sends', () {
      expect(Money.tryParse('150000')?.poisha, 150000);
      expect(Money.tryParse(150000)?.poisha, 150000);
      expect(Money.tryParse('150000.00')?.poisha, 150000);
    });

    test('a missing amount stays null instead of becoming zero', () {
      expect(Money.tryParse(null), isNull);
      expect(Money.tryParse(''), isNull);
      expect(Money.tryParse('not-a-number'), isNull);
    });

    test('parseOrZero is only for genuinely required fields', () {
      expect(Money.parseOrZero(null), Money.zero);
      expect(Money.parseOrZero('250'), const Money(250));
    });

    test('splits taka and poisha', () {
      const amount = Money(150050);
      expect(amount.wholeTaka, 1500);
      expect(amount.fractionalPoisha, 50);
    });

    test('round-trips through the wire format', () {
      expect(const Money(150000).toWire(), '150000');
    });
  });

  group('KFormat', () {
    Future<String> render(
      WidgetTester tester,
      Locale locale,
      String Function(BuildContext context) build,
    ) async {
      late String output;
      await tester.pumpWidget(
        MaterialApp(
          locale: locale,
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          home: Builder(
            builder: (context) {
              output = build(context);
              return const SizedBox.shrink();
            },
          ),
        ),
      );
      return output;
    }

    testWidgets('whole taka drop the decimals', (tester) async {
      final output = await render(
        tester,
        const Locale('en'),
        (context) => KFormat.money(context, const Money(150000)),
      );
      expect(output, '৳1,500');
    });

    testWidgets('a part-taka amount keeps them', (tester) async {
      final output = await render(
        tester,
        const Locale('en'),
        (context) => KFormat.money(context, const Money(150050)),
      );
      expect(output, '৳1,500.50');
    });

    testWidgets('Bangla renders Bangla numerals', (tester) async {
      final output = await render(
        tester,
        const Locale('bn'),
        (context) => KFormat.money(context, const Money(150000)),
      );
      expect(output, contains('৳'));
      expect(
        RegExp(r'[০-৯]').hasMatch(output),
        isTrue,
        reason: 'Bangla money should not print Latin digits: $output',
      );
    });

    testWidgets('a range collapses when both ends match', (tester) async {
      final output = await render(
        tester,
        const Locale('en'),
        (context) => KFormat.moneyRange(
          context,
          const Money(150000),
          const Money(150000),
        )!,
      );
      expect(output, '৳1,500');
    });

    testWidgets('a range shows both ends when they differ', (tester) async {
      final output = await render(
        tester,
        const Locale('en'),
        (context) => KFormat.moneyRange(
          context,
          const Money(100000),
          const Money(150000),
        )!,
      );
      expect(output, '৳1,000 – ৳1,500');
    });

    testWidgets('no budget renders nothing at all', (tester) async {
      final output = await render(
        tester,
        const Locale('en'),
        (context) => KFormat.moneyRange(context, null, null) ?? 'ABSENT',
      );
      expect(output, 'ABSENT');
    });

    testWidgets('dates are localized, not left in English', (tester) async {
      final when = DateTime(2026, 9, 5, 9, 41);
      final english = await render(
        tester,
        const Locale('en'),
        (context) => KFormat.dateTime(context, when),
      );
      final bangla = await render(
        tester,
        const Locale('bn'),
        (context) => KFormat.dateTime(context, when),
      );

      expect(english, contains('2026'));
      expect(bangla, isNot(equals(english)));
      expect(
        RegExp(r'[০-৯]').hasMatch(bangla),
        isTrue,
        reason: 'Bangla dates should not print Latin digits: $bangla',
      );
    });

    testWidgets('relative time pluralizes instead of saying "1 days"', (
      tester,
    ) async {
      final oneDay = DateTime.now().subtract(const Duration(days: 1));
      final threeDays = DateTime.now().subtract(const Duration(days: 3));

      expect(
        await render(
          tester,
          const Locale('en'),
          (context) => KFormat.relativePast(context, oneDay),
        ),
        '1 day ago',
      );
      expect(
        await render(
          tester,
          const Locale('en'),
          (context) => KFormat.relativePast(context, threeDays),
        ),
        '3 days ago',
      );
    });
  });
}

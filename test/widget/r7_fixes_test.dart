import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/formatting/kaaj_format.dart';
import 'package:kaaj/core/localization/kaaj_localizations.dart';
import 'package:kaaj/core/widgets/k_error_message.dart';
import 'package:kaaj/features/explore/explore_screen.dart';
import 'package:kaaj/features/home/presentation/screens/home_screen.dart';
import 'package:kaaj/features/jobs/presentation/screens/jobs_screens.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

class _Probe extends StatelessWidget {
  const _Probe(this.text);

  final String Function(BuildContext) text;

  @override
  Widget build(BuildContext context) => Text(text(context));
}

void main() {
  group('M3 copy', () {
    test('labels that used to stay in Bangla have English', () {
      for (final (bn, en) in [
        ('পরিচয় যাচাই', 'Identity verification'),
        ('মোট আসন', 'Total seats'),
        ('ছবি তুলুন', 'Take photo'),
        ('সম্পর্কে', 'About'),
        ('২ দিন ৩ ঘণ্টা বাকি', '2 days 3 hours remaining'),
      ]) {
        expect(KaajLocalizations.forLanguage('en', bn), en, reason: bn);
      }
    });

    for (final (language, count, expected) in [
      ('en', 1, '1 member'),
      ('en', 12, '12 members'),
      ('bn', 12, '১২ জন সদস্য'),
    ]) {
      testWidgets('member count reads "$expected"', (tester) async {
        await pumpRouted(
          tester,
          api: FakeApi(),
          home: Scaffold(
            body: _Probe((context) => KFormat.members(context, count)),
          ),
          locale: Locale(language),
        );
        expect(find.text(expected), findsOneWidget);
      });
    }
  });

  for (final (language, unread, expected) in [
    ('en', 2, 'Notifications, 2 unread'),
    ('en', 0, 'Notifications'),
    ('bn', 3, 'নোটিফিকেশন, ৩টি অপঠিত'),
  ]) {
    testWidgets('M4 bell label: "$expected"', (tester) async {
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: Scaffold(
          body: _Probe((context) => bellSemanticsLabel(context, unread)),
        ),
        locale: Locale(language),
      );
      expect(find.text(expected), findsOneWidget);
    });
  }

  testWidgets('M5 every Explore section is in sight on a narrow phone', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET /jobs', FakeResponse.data({'items': <Object>[]}));
    await pumpRouted(
      tester,
      api: api,
      home: const ExploreScreen(),
      size: const Size(360, 780),
      overrides: [meAs(KaajRole.worker)],
    );
    final screen = tester.getRect(find.byType(ExploreScreen));
    for (final key in [
      'explore-work',
      'explore-people',
      'explore-learn',
      'explore-business',
      'explore-ideas',
      'explore-community',
    ]) {
      final chip = tester.getRect(find.byKey(ValueKey(key)));
      expect(screen.contains(chip.topLeft), isTrue, reason: key);
      expect(
        screen.contains(chip.bottomRight - const Offset(1, 1)),
        isTrue,
        reason: key,
      );
    }
    expect(tester.takeException(), isNull);
  });

  test('idempotency refusals have their own copy (B4)', () {
    for (final language in ['en', 'bn']) {
      final l10n = lookupAppLocalizations(Locale(language));
      for (final code in [
        'IDEMPOTENCY_KEY_REUSED',
        'IDEMPOTENCY_IN_PROGRESS',
        'IDEMPOTENCY_KEY_INVALID',
      ]) {
        expect(
          serverCodeMessage(
            l10n,
            Failure(kind: FailureKind.conflict, message: 'x', code: code),
          ),
          isNotNull,
          reason: '$code $language',
        );
      }
    }
  });

  testWidgets('M7 a category name typed in Explore goes to the server', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET /jobs', FakeResponse.data({'items': <Object>[]}));
    await pumpRouted(
      tester,
      api: api,
      home: const JobFeedScreen(embedded: true, searchQuery: 'Tutoring'),
      overrides: [meAs(KaajRole.worker)],
    );
    // The server matches category and skill names in both languages.
    expect(api.called('GET /jobs').last.query['q'], 'Tutoring');
  });
}

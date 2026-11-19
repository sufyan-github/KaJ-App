import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/errors/server_code_copy.dart';
import 'package:kaaj/core/widgets/k_error_message.dart';
import 'package:kaaj/features/jobs/presentation/screens/jobs_screens.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _draft() => {
  'id': 'job-9',
  'title': 'Paint the gate',
  'description': 'One coat of paint on a small iron gate.',
  'status': 'DRAFT',
  'category': {'id': 'cat-1', 'name_bn': 'রং', 'name_en': 'Painting'},
  'location': {'name_bn': 'বোয়ালিয়া', 'name_en': 'Boalia'},
  'skills': <Object>[],
};

void main() {
  const codes = [
    'ACCOUNT_RESTRICTED',
    'REVERIFICATION_REQUIRED',
    'ACCOUNT_SUSPENDED',
    'ACCOUNT_UNAVAILABLE',
    'SUBSCRIPTION_REQUIRED',
    'USER_BLOCKED',
    'HIRING_UNAVAILABLE',
    'ALREADY_APPLIED',
    'PAYLOAD_TOO_LARGE',
    'SERVICE_UNAVAILABLE',
    'CONCURRENT_UPDATE',
    'RATE_LIMITED',
    'MENTOR_APPROVAL_REQUIRED',
    'MENTOR_SUSPENDED',
    'IDENTITY_REQUIRED',
    'MENTOR_APPLICATION_PENDING',
    'MENTOR_ALREADY_APPROVED',
    'OPPORTUNITY_CLOSED',
    'OWN_OPPORTUNITY',
    'LEARNING_TERMS_INVALID',
    'NOT_A_WORK_JOB',
    'SEATS_FULL',
    'SESSION_IN_FUTURE',
    'ENROLMENT_NOT_ACTIVE',
    'NO_CONFIRMED_SESSIONS',
  ];

  for (final language in ['en', 'bn']) {
    test('every stable server code has its own $language message', () {
      final l10n = lookupAppLocalizations(Locale(language));
      final seen = <String>{};
      for (final code in codes) {
        final message = serverCodeMessage(
          l10n,
          Failure(kind: FailureKind.forbidden, message: 'x', code: code),
        );
        expect(message, isNotNull, reason: code);
        expect(message, isNot(l10n.forbiddenMessage), reason: code);
        seen.add(message!);
      }
      // RATE_LIMITED reuses the existing copy; the rest are distinct.
      expect(seen.length, codes.length);
    });
  }

  test('every code in the server table has Bangla and English', () {
    final bangla = RegExp(r'[\u0980-\u09FF]');
    for (final entry in serverCodeCopy.entries) {
      expect(entry.value.bn, matches(bangla), reason: entry.key);
      expect(entry.value.en, isNot(matches(bangla)), reason: entry.key);
    }
    for (final code in [
      'ROLE_REQUIRED',
      'WOMEN_ONLY',
      'SESSION_FULL',
      'INTRODUCTION_ALREADY_PENDING',
      'GENDER_RESTRICTION_NOT_ALLOWED',
      'UPLOAD_CONTENT_INVALID',
    ]) {
      expect(serverCodeCopy, contains(code));
    }
  });

  test('a new mentor refused for the role gets an explanation', () {
    for (final language in ['en', 'bn']) {
      final message = serverCodeMessage(
        lookupAppLocalizations(Locale(language)),
        const Failure(
          kind: FailureKind.forbidden,
          message: 'Role required',
          code: 'ROLE_REQUIRED',
        ),
      );
      expect(
        message,
        language == 'en'
            ? contains('try again in a few minutes')
            : contains('কয়েক মিনিট পরে'),
      );
    }
  });

  test('server reason: Bangla text when sent, code always', () {
    const failure = Failure(
      kind: FailureKind.conflict,
      message: 'Identity verification is required before SKILL.',
      messageBn: 'দক্ষতা যাচাইয়ের আগে পরিচয় যাচাই করুন।',
      code: 'CONFLICT',
    );
    expect(
      failure.serverReason(bangla: true),
      'দক্ষতা যাচাইয়ের আগে পরিচয় যাচাই করুন। (CONFLICT)',
    );
    expect(
      failure.serverReason(bangla: false),
      'Identity verification is required before SKILL. (CONFLICT)',
    );
    expect(
      const Failure(
        kind: FailureKind.network,
        message: 'offline',
        code: 'X',
      ).serverReason(bangla: false),
      isNull,
    );
  });

  test('an unknown code keeps the screen fallback', () {
    final l10n = lookupAppLocalizations(const Locale('en'));
    expect(
      serverCodeMessage(
        l10n,
        const Failure(
          kind: FailureKind.conflict,
          message: 'x',
          code: 'CONFLICT',
        ),
      ),
      isNull,
    );
    expect(
      localizedFailureMessage(
        l10n,
        const Failure(
          kind: FailureKind.conflict,
          message: 'x',
          code: 'CONFLICT',
        ),
      ),
      l10n.conflictMessage,
    );
  });

  group('screens show the server reason instead of a generic line', () {
    Future<FakeApi> pumpDrafts(
      WidgetTester tester,
      FakeResponse publish, {
      String language = 'en',
    }) async {
      final api = FakeApi()
        ..on(
          'GET /jobs/mine',
          FakeResponse.data({
            'items': [_draft()],
          }),
        )
        ..on('POST /jobs/job-9/publish', publish);
      await pumpRouted(
        tester,
        api: api,
        home: const JobFeedScreen(),
        locale: Locale(language),
        overrides: [meAs(KaajRole.customer)],
      );
      await tester.tap(find.text(language == 'en' ? 'Publish' : 'প্রকাশ করুন'));
      await tester.pumpAndSettle();
      return api;
    }

    testWidgets('subscription required (en)', (tester) async {
      await pumpDrafts(
        tester,
        FakeResponse.error(403, 'SUBSCRIPTION_REQUIRED'),
      );
      expect(
        find.text(
          'Your subscription is inactive or has expired. Renew it in Settings to continue.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('account restricted (bn)', (tester) async {
      await pumpDrafts(
        tester,
        FakeResponse.error(403, 'ACCOUNT_RESTRICTED'),
        language: 'bn',
      );
      expect(
        find.textContaining('আপনার অ্যাকাউন্টে কাজের সুবিধা সাময়িকভাবে সীমিত'),
        findsOneWidget,
      );
    });

    testWidgets('an unmapped rule keeps the screen line and shows the '
        'server reason with its code', (tester) async {
      await pumpDrafts(tester, FakeResponse.error(409, 'CONFLICT'));
      expect(
        find.text(
          'Could not publish the draft. Try again.\n'
          'Request refused (CONFLICT)',
        ),
        findsOneWidget,
      );
    });

    testWidgets('a feed that fails to load explains a known code', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /jobs/mine', FakeResponse.error(403, 'ACCOUNT_SUSPENDED'));
      await pumpRouted(
        tester,
        api: api,
        home: const JobFeedScreen(),
        overrides: [meAs(KaajRole.customer)],
      );
      expect(
        find.text(
          'This account is suspended. Contact KAAJ support if you think this is a mistake.',
        ),
        findsOneWidget,
      );
      expect(find.text('Try again'), findsOneWidget);
    });
  });
}

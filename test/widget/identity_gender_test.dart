import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/widgets/k_error_message.dart';
import 'package:kaaj/features/trust_safety/data/trust_safety_repository.dart';
import 'package:kaaj/features/trust_safety/presentation/verification_screens.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

import '../features/profile/my_profile_repository_test.dart' show myProfileJson;
import '../support/fake_api.dart';
import '../support/pump_app.dart';

void main() {
  test('the identity request carries the declared gender (B1)', () async {
    final api = FakeApi()
      ..on(
        'POST /verification-requests',
        FakeResponse.data({'id': 'v1', 'declaredGender': 'FEMALE'}),
      );
    await TrustSafetyRepository(api.dio()).requestIdentityVerification(
      nidDocumentId: 'doc-nid',
      selfieDocumentId: 'doc-selfie',
      gender: 'FEMALE',
    );
    expect(api.called('POST /verification-requests').single.data, {
      'kind': 'IDENTITY',
      'nidDocumentId': 'doc-nid',
      'selfieDocumentId': 'doc-selfie',
      'gender': 'FEMALE',
    });
  });

  for (final (gender, shown) in [('FEMALE', 'Female'), (null, null)]) {
    testWidgets('identity form gender: profile ${gender ?? 'empty'}', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /profiles/me',
          FakeResponse.data({...myProfileJson(), 'gender': gender}),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const VerificationCaptureScreen(kind: 'IDENTITY'),
        size: const Size(400, 1600),
      );
      final field = find.byKey(const ValueKey('identity-gender'));
      expect(field, findsOneWidget);
      if (shown != null) {
        expect(
          find.descendant(of: field, matching: find.text(shown)),
          findsOneWidget,
        );
      }
      expect(find.textContaining('cannot be changed later'), findsOneWidget);
    });
  }

  test('GENDER_REQUIRED is explained', () {
    for (final language in ['en', 'bn']) {
      expect(
        serverCodeMessage(
          lookupAppLocalizations(Locale(language)),
          const Failure(
            kind: FailureKind.validation,
            message: 'x',
            code: 'GENDER_REQUIRED',
          ),
        ),
        isNotNull,
      );
    }
  });
}

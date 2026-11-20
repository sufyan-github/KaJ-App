import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/business/presentation/business_providers.dart';
import 'package:kaaj/features/business/presentation/business_verification_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/trust_safety/presentation/verification_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _business({
  String role = 'OWNER',
  String stage = 'REGISTERED',
  String? licence = 'TL-77',
}) => {
  'id': 'b-1',
  'name': 'Rahim Agro',
  'stage': stage,
  'isPublic': true,
  'status': 'ACTIVE',
  'tradeLicenceNo': licence,
  'verificationStatus': 'NOT_SUBMITTED',
  'myRole': role,
};

Map<String, dynamic> _status(
  String status, {
  bool canSubmit = false,
  String? reason,
}) => {
  'businessId': 'b-1',
  'verificationStatus': status,
  'verified': status == 'APPROVED',
  'canSubmit': canSubmit,
  'latestRequest': status == 'NOT_SUBMITTED'
      ? null
      : {
          'id': 'v-1',
          'status': status,
          'rejectionReason': reason,
          'submittedAt': '2026-11-10T10:00:00Z',
          'reviewedAt': null,
        },
};

/// A 1x1 transparent PNG, so the thumbnail can decode.
final _pixel = Uint8List.fromList(const [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, //
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

Future<List<String>> _open(
  WidgetTester tester,
  FakeApi api, {
  Locale locale = const Locale('en'),
}) async {
  final uploads = <String>[];
  await pumpRouted(
    tester,
    api: api,
    home: const BusinessVerificationScreen(businessId: 'b-1'),
    locale: locale,
    size: const Size(400, 1600),
    overrides: [
      meAs(KaajRole.worker),
      businessDocumentPickerProvider.overrideWithValue(() async => _pixel),
      businessDocumentUploaderProvider.overrideWithValue((bytes) async {
        uploads.add('doc-${uploads.length + 1}');
        return uploads.last;
      }),
    ],
  );
  return uploads;
}

Future<void> _addTwoPhotosAndSubmit(WidgetTester tester) async {
  await tester.tap(find.byKey(const ValueKey('verification-add-photo')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('verification-add-photo')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('verification-consent')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('verification-submit')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the owner uploads documents and submits them', (tester) async {
    final api = FakeApi()
      ..on('GET /businesses/b-1', FakeResponse.data(_business()))
      ..on(
        'GET /businesses/b-1/verification',
        FakeResponse.data(_status('NOT_SUBMITTED', canSubmit: true)),
      )
      ..on(
        'POST /businesses/b-1/verification',
        FakeResponse.data(_status('PENDING')),
      );
    final uploads = await _open(tester, api);
    expect(
      find.byKey(const ValueKey('verification-status-NOT_SUBMITTED')),
      findsOneWidget,
    );
    api.on(
      'GET /businesses/b-1/verification',
      FakeResponse.data(_status('PENDING')),
    );
    await _addTwoPhotosAndSubmit(tester);
    expect(uploads, ['doc-1', 'doc-2']);
    expect(api.called('POST /businesses/b-1/verification').single.data, {
      'documentIds': ['doc-1', 'doc-2'],
    });
    expect(
      find.byKey(const ValueKey('verification-status-PENDING')),
      findsOneWidget,
    );
  });

  testWidgets('missing identity is explained with a link', (tester) async {
    final api = FakeApi()
      ..on('GET /businesses/b-1', FakeResponse.data(_business()))
      ..on(
        'GET /businesses/b-1/verification',
        FakeResponse.data(_status('NOT_SUBMITTED', canSubmit: true)),
      )
      ..on(
        'POST /businesses/b-1/verification',
        FakeResponse.error(409, 'IDENTITY_REQUIRED'),
      );
    await _open(tester, api);
    await _addTwoPhotosAndSubmit(tester);
    expect(find.byKey(const ValueKey('verification-identity')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('verification-identity-go')));
    await tester.pumpAndSettle();
    expect(find.text('route:/verification/IDENTITY/capture'), findsOneWidget);
  });

  testWidgets('an already verified refusal shows the server copy', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET /businesses/b-1', FakeResponse.data(_business()))
      ..on(
        'GET /businesses/b-1/verification',
        FakeResponse.data(
          _status('REJECTED', canSubmit: true, reason: 'Blurry'),
        ),
      )
      ..on(
        'POST /businesses/b-1/verification',
        FakeResponse.error(409, 'BUSINESS_ALREADY_VERIFIED'),
      );
    await _open(tester, api);
    expect(find.textContaining('Blurry'), findsOneWidget);
    await _addTwoPhotosAndSubmit(tester);
    expect(find.text('This business is already verified.'), findsOneWidget);
  });

  testWidgets('an unregistered business is explained and links to edit', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /businesses/b-1',
        FakeResponse.data(_business(stage: 'INFORMAL', licence: null)),
      )
      ..on(
        'GET /businesses/b-1/verification',
        FakeResponse.data(_status('NOT_SUBMITTED')),
      );
    await _open(tester, api);
    expect(
      find.byKey(const ValueKey('verification-not-registered')),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('verification-submit')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('verification-edit')));
    await tester.pumpAndSettle();
    expect(find.text('route:/businesses/b-1/edit'), findsOneWidget);
  });

  testWidgets('staff see the status only (bn)', (tester) async {
    final api = FakeApi()
      ..on('GET /businesses/b-1', FakeResponse.data(_business(role: 'STAFF')))
      ..on(
        'GET /businesses/b-1/verification',
        FakeResponse.data(_status('NOT_SUBMITTED', canSubmit: true)),
      );
    await _open(tester, api, locale: const Locale('bn'));
    expect(
      find.text('শুধু ব্যবসার মালিক যাচাইয়ের জন্য নথি জমা দিতে পারেন।'),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('verification-submit')), findsNothing);
  });

  testWidgets('verification centre opens My businesses for a business', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /verification-requests/mine',
        FakeResponse.data({'items': <Object>[]}),
      );
    await pumpRouted(
      tester,
      api: api,
      home: const VerificationCenterScreen(),
      overrides: [meAs(KaajRole.worker)],
    );
    await tester.tap(find.byKey(const ValueKey('verification-business')));
    await tester.pumpAndSettle();
    expect(find.text('route:/businesses'), findsOneWidget);
    expect(api.called('POST /verification-requests'), isEmpty);
  });
}

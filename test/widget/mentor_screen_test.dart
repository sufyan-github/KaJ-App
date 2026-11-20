import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/widgets/k_primary_button.dart';
import 'package:kaaj/core/widgets/k_text_field.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_skill.dart';
import 'package:kaaj/features/catalog/presentation/controllers/catalog_providers.dart';
import 'package:kaaj/features/mentor/presentation/mentor_providers.dart';
import 'package:kaaj/features/mentor/presentation/mentor_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/profile/domain/me.dart';
import 'package:kaaj/features/profile/presentation/controllers/me_provider.dart';
import 'package:kaaj/features/settings/presentation/settings_screens.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

const _skills = [
  CatalogSkill(
    id: 'skill-wiring',
    slug: 'wiring',
    nameEn: 'House wiring',
    nameBn: 'ঘরের ওয়্যারিং',
    categoryId: 'cat-1',
  ),
  CatalogSkill(
    id: 'skill-sewing',
    slug: 'sewing',
    nameEn: 'Sewing',
    nameBn: 'সেলাই',
    categoryId: 'cat-2',
  ),
];

Map<String, dynamic> _mentor(String status, {bool accepting = false}) => {
  'status': status,
  'accepting': accepting,
  'bio': '',
  'skills': status == 'APPROVED'
      ? [
          {
            'skillId': 'skill-wiring',
            'nameEn': 'House wiring',
            'nameBn': 'ঘরের ওয়্যারিং',
          },
        ]
      : <Object>[],
};

Future<FakeApi> _open(
  WidgetTester tester,
  FakeApi api, {
  Locale locale = const Locale('en'),
}) async {
  await pumpRouted(
    tester,
    api: api,
    home: const MentorScreen(),
    locale: locale,
    size: const Size(400, 2000),
    overrides: [
      meAs(KaajRole.worker),
      catalogSkillsProvider.overrideWith((ref) async => _skills),
      mentorEvidencePickerProvider.overrideWithValue(
        () async => Uint8List.fromList(_pixel),
      ),
      mentorEvidenceUploaderProvider.overrideWithValue((bytes) async {
        uploads.add('doc-${uploads.length + 1}');
        return uploads.last;
      }),
    ],
  );
  return api;
}

/// A 1x1 transparent PNG, so the evidence thumbnail can decode.
const _pixel = [
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
  0x00,
  0x00,
  0x00,
  0x0D,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1F,
  0x15,
  0xC4,
  0x89,
  0x00,
  0x00,
  0x00,
  0x0A,
  0x49,
  0x44,
  0x41,
  0x54,
  0x78,
  0x9C,
  0x63,
  0x00,
  0x01,
  0x00,
  0x00,
  0x05,
  0x00,
  0x01,
  0x0D,
  0x0A,
  0x2D,
  0xB4,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4E,
  0x44,
  0xAE,
  0x42,
  0x60,
  0x82,
];

final uploads = <String>[];

void main() {
  setUp(uploads.clear);

  testWidgets('applies with a skill, then shows the review state', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET /me/mentor', FakeResponse.data(_mentor('NONE')))
      ..on(
        'POST /me/mentor/application',
        FakeResponse.data(_mentor('PENDING')),
      );
    await _open(tester, api);
    expect(find.text('Become a mentor'), findsOneWidget);

    // No skill chosen yet.
    final fields = tester
        .widgetList<KTextField>(find.byType(KTextField))
        .toList();
    fields[1].controller!.text = 'I teach safe house wiring step by step.';
    await tester.ensureVisible(find.byType(KPrimaryButton));
    await tester.tap(find.byType(KPrimaryButton));
    await tester.pumpAndSettle();
    expect(
      find.text('Choose at least one skill you can teach.'),
      findsOneWidget,
    );
    expect(api.called('POST /me/mentor/application'), isEmpty);

    await tester.tap(find.byKey(const ValueKey('mentor-skill-skill-wiring')));
    fields[0].controller!.text = '৭';
    await tester.ensureVisible(find.byType(KPrimaryButton));
    await tester.tap(find.byType(KPrimaryButton));
    await tester.pumpAndSettle();
    expect(
      find.text('Add at least one photo as proof of your skill.'),
      findsOneWidget,
    );
    await tester.ensureVisible(
      find.byKey(const ValueKey('mentor-add-evidence')),
    );
    await tester.tap(find.byKey(const ValueKey('mentor-add-evidence')));
    await tester.pumpAndSettle();
    api.on('GET /me/mentor', FakeResponse.data(_mentor('PENDING')));
    await tester.ensureVisible(find.byType(KPrimaryButton));
    await tester.tap(find.byType(KPrimaryButton));
    await tester.pumpAndSettle();

    final body = api.called('POST /me/mentor/application').single.data! as Map;
    expect(body['skills'], [
      {'skillId': 'skill-wiring'},
    ]);
    expect(body['bio'], 'I teach safe house wiring step by step.');
    expect(body['yearsExperience'], 7);
    expect(body['documentIds'], ['doc-1']);
    expect(body.containsKey('accepting'), isFalse);
    expect(find.byKey(const ValueKey('mentor-pending')), findsOneWidget);
  });

  testWidgets('identity is required first, with a way to do it', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET /me/mentor', FakeResponse.data(_mentor('NONE')))
      ..on(
        'POST /me/mentor/application',
        FakeResponse.error(409, 'IDENTITY_REQUIRED'),
      );
    await _open(tester, api);
    await tester.tap(find.byKey(const ValueKey('mentor-skill-skill-sewing')));
    tester
            .widgetList<KTextField>(find.byType(KTextField))
            .last
            .controller!
            .text =
        'I have taught sewing to neighbours for years.';
    await tester.ensureVisible(
      find.byKey(const ValueKey('mentor-add-evidence')),
    );
    await tester.tap(find.byKey(const ValueKey('mentor-add-evidence')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byType(KPrimaryButton));
    await tester.tap(find.byType(KPrimaryButton));
    await tester.pumpAndSettle();

    expect(
      find.text('Verify your identity (NID and selfie) first.'),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const ValueKey('mentor-verify-identity')));
    await tester.pumpAndSettle();
    expect(find.text('route:/verification/IDENTITY/capture'), findsOneWidget);
  });

  testWidgets('a rejected application shows why and can be redone', (
    tester,
  ) async {
    await _open(
      tester,
      FakeApi()..on(
        'GET /me/mentor',
        FakeResponse.data({
          ..._mentor('REJECTED'),
          'application': {
            'verificationRequestId': 'v1',
            'status': 'REJECTED',
            'rejectionReason': 'The certificate photo was unreadable.',
          },
        }),
      ),
    );
    expect(find.text('The certificate photo was unreadable.'), findsOneWidget);
    expect(find.byType(KPrimaryButton), findsOneWidget);
  });

  testWidgets('a pending application says so (bn)', (tester) async {
    await _open(
      tester,
      FakeApi()..on('GET /me/mentor', FakeResponse.data(_mentor('PENDING'))),
      locale: const Locale('bn'),
    );
    expect(find.text('আবেদন পর্যালোচনায় আছে'), findsOneWidget);
    expect(find.byType(KPrimaryButton), findsNothing);
  });

  testWidgets('an approved mentor can stop taking learners', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /me/mentor',
        FakeResponse.data(_mentor('APPROVED', accepting: true)),
      )
      ..on('PUT /me/mentor', FakeResponse.data(_mentor('APPROVED')));
    await _open(tester, api);
    expect(find.text('You are a KAAJ mentor'), findsOneWidget);
    expect(find.text('House wiring'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('mentor-accepting')));
    await tester.pumpAndSettle();
    expect(api.called('PUT /me/mentor').single.data, {'accepting': false});
    expect(
      tester
          .widget<SwitchListTile>(
            find.byKey(const ValueKey('mentor-accepting')),
          )
          .value,
      isFalse,
    );
  });

  testWidgets('a failed toggle switches back and explains', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /me/mentor',
        FakeResponse.data(_mentor('APPROVED', accepting: true)),
      )
      ..on('PUT /me/mentor', FakeResponse.error(403, 'MENTOR_SUSPENDED'));
    await _open(tester, api);
    await tester.tap(find.byKey(const ValueKey('mentor-accepting')));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<SwitchListTile>(
            find.byKey(const ValueKey('mentor-accepting')),
          )
          .value,
      isTrue,
    );
    expect(find.text('Your mentor profile is suspended.'), findsOneWidget);
  });

  testWidgets('an older server without /me/mentor uses the roles', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET /me/mentor', FakeResponse.error(404, 'NOT_FOUND'))
      ..on(
        'GET /profiles/me',
        FakeResponse.data({
          'roles': ['WORKER', 'MENTOR'],
          'activeRole': 'WORKER',
        }),
      );
    await _open(tester, api);
    expect(find.byKey(const ValueKey('mentor-approved')), findsOneWidget);
  });

  testWidgets('a load failure shows the server reason', (tester) async {
    await _open(
      tester,
      FakeApi()
        ..on('GET /me/mentor', FakeResponse.error(503, 'SERVICE_UNAVAILABLE')),
    );
    expect(find.textContaining('KAAJ is busy'), findsOneWidget);
  });

  for (final mentor in [false, true]) {
    testWidgets(
      'Settings offers ${mentor ? 'the mentor profile' : 'becoming a mentor'}',
      (tester) async {
        final me = testMe(KaajRole.customer);
        await pumpRouted(
          tester,
          api: FakeApi(),
          home: const SettingsScreen(),
          size: const Size(400, 2400),
          overrides: [
            meProvider.overrideWith(
              (ref) async => Me(
                userId: me.userId,
                phone: me.phone,
                roles: mentor
                    ? const ['CUSTOMER', 'MENTOR']
                    : const ['CUSTOMER'],
                activeRole: 'CUSTOMER',
                displayName: me.displayName,
                skills: const [],
              ),
            ),
          ],
        );
        expect(
          find.text(mentor ? 'Mentor profile' : 'Become a mentor'),
          findsOneWidget,
        );
        await tester.tap(find.byKey(const ValueKey('settings-mentor')));
        await tester.pumpAndSettle();
        expect(find.text('route:/mentor'), findsOneWidget);
      },
    );
  }

  testWidgets('an approved mentor sets consultation times (R2)', (
    tester,
  ) async {
    final api = FakeApi()
      ..on(
        'GET /me/mentor',
        FakeResponse.data(_mentor('APPROVED', accepting: true)),
      );
    await _open(tester, api);
    await tester.ensureVisible(
      find.byKey(const ValueKey('mentor-availability')),
    );
    await tester.tap(find.byKey(const ValueKey('mentor-availability')));
    await tester.pumpAndSettle();
    expect(find.text('route:/w/availability'), findsOneWidget);
  });
}

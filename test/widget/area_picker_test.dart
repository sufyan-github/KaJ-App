import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/widgets/k_primary_button.dart';
import 'package:kaaj/features/catalog/data/datasources/catalog_remote_data_source.dart';
import 'package:kaaj/features/catalog/data/repositories/catalog_repository_impl.dart';
import 'package:kaaj/features/catalog/presentation/controllers/catalog_providers.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/onboarding/presentation/controllers/onboarding_controller.dart';
import 'package:kaaj/features/onboarding/presentation/screens/onboarding_screens.dart';
import 'package:mocktail/mocktail.dart';

import '../features/profile/my_profile_repository_test.dart' show myProfileJson;
import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _place(
  String id,
  String type,
  String en,
  String bn, [
  String? parent,
]) => {'id': id, 'parentId': parent, 'type': type, 'nameEn': en, 'nameBn': bn};

/// The real place tree, one level per request as the API serves it.
FakeApi _placesApi() => FakeApi()
  ..onRequest('GET /locations', (request) {
    return switch (request.query['parentId']) {
      null => FakeResponse.data([
        _place('city-raj', 'CITY', 'Rajshahi', 'রাজশাহী'),
      ]),
      'city-raj' => FakeResponse.data([
        _place('thana-boa', 'THANA', 'Boalia', 'বোয়ালিয়া', 'city-raj'),
        _place('thana-raj', 'THANA', 'Rajpara', 'রাজপাড়া', 'city-raj'),
      ]),
      'thana-boa' => FakeResponse.data([
        _place('area-kaz', 'AREA', 'Kazla', 'কাজলা', 'thana-boa'),
        _place('area-tal', 'AREA', 'Talaimari', 'তালাইমারী', 'thana-boa'),
      ]),
      _ => FakeResponse.data(<Object>[]),
    };
  });

void main() {
  setUpAll(() => registerFallbackValue(const OnboardingState()));

  List<Override> overridesFor(FakeApi api) => [
    catalogRepositoryProvider.overrideWithValue(
      CatalogRepositoryImpl(CatalogRemoteDataSource(api.dio())),
    ),
  ];

  testWidgets('onboarding reaches a thana area, not just the city', (
    tester,
  ) async {
    final api = _placesApi();
    final repository = MockOnboardingRepository();
    when(() => repository.updateProfile(any())).thenAnswer((_) async {});
    final controller = onboardingFor(
      KaajRole.customer,
      complete: false,
      repository: repository,
    );
    await pumpRouted(
      tester,
      api: api,
      home: const LocationSelectionScreen(),
      size: const Size(400, 2000),
      overrides: [
        ...overridesFor(api),
        onboardingControllerProvider.overrideWith((ref) => controller),
      ],
    );

    // The only city opens by itself and shows its thanas.
    expect(find.text('Boalia'), findsOneWidget);
    expect(find.text('Rajpara'), findsOneWidget);
    await tester.tap(find.text('Boalia'));
    await tester.pumpAndSettle();
    expect(find.text('Kazla'), findsOneWidget);
    expect(find.text('Talaimari'), findsOneWidget);

    await tester.tap(find.text('Kazla'));
    await tester.pumpAndSettle();
    // The choice is kept in the draft at once.
    expect(controller.state.locationId, 'area-kaz');

    await tester.ensureVisible(find.byType(KPrimaryButton));
    await tester.tap(find.byType(KPrimaryButton));
    await tester.pumpAndSettle();
    final saved =
        verify(() => repository.updateProfile(captureAny())).captured.single
            as OnboardingState;
    expect(saved.locationId, 'area-kaz');
  });

  testWidgets('a choice made before the app was resumed can be confirmed', (
    tester,
  ) async {
    final api = _placesApi();
    final repository = MockOnboardingRepository();
    when(repository.restore).thenReturn(
      const OnboardingState(started: true, step: 2, locationId: 'area-tal'),
    );
    when(() => repository.persist(any())).thenAnswer((_) async {});
    when(() => repository.updateProfile(any())).thenAnswer((_) async {});
    await pumpRouted(
      tester,
      api: api,
      home: const LocationSelectionScreen(),
      size: const Size(400, 2000),
      overrides: [
        ...overridesFor(api),
        onboardingControllerProvider.overrideWith(
          (ref) => OnboardingController(repository),
        ),
      ],
    );
    final confirm = tester.widget<KPrimaryButton>(find.byType(KPrimaryButton));
    expect(confirm.onPressed, isNotNull);
    await tester.ensureVisible(find.byType(KPrimaryButton));
    await tester.tap(find.byType(KPrimaryButton));
    await tester.pumpAndSettle();
    verify(() => repository.updateProfile(any())).called(1);
  });

  testWidgets('edit profile picks an area through city and thana', (
    tester,
  ) async {
    final api = _placesApi()
      ..on('GET /profiles/me', FakeResponse.data(myProfileJson()))
      ..on('PUT /profiles/me', FakeResponse.data({}));
    await pumpRouted(
      tester,
      api: api,
      initial: '/profile/edit',
      size: const Size(400, 1400),
      overrides: overridesFor(api),
    );
    await tester.ensureVisible(find.byKey(const ValueKey('profile-area')));
    await tester.tap(find.byKey(const ValueKey('profile-area')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Boalia').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Talaimari'));
    await tester.pumpAndSettle();
    expect(find.text('Talaimari'), findsOneWidget);

    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(
      (api.called('PUT /profiles/me').single.data! as Map)['primaryLocationId'],
      'area-tal',
    );
  });
}

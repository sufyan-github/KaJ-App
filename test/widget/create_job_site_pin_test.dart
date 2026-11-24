import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/location/location_gateway.dart';
import 'package:kaaj/core/permissions/permission_gateway.dart';
import 'package:kaaj/core/theme/app_theme.dart';
import 'package:kaaj/core/widgets/k_primary_button.dart';
import 'package:kaaj/core/widgets/k_text_field.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_category.dart';
import 'package:kaaj/features/catalog/presentation/controllers/catalog_providers.dart';
import 'package:kaaj/features/jobs/data/jobs_repository.dart';
import 'package:kaaj/features/jobs/presentation/controllers/jobs_providers.dart';
import 'package:kaaj/features/jobs/presentation/screens/jobs_screens.dart';
import 'package:kaaj/features/onboarding/data/onboarding_repository.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/onboarding/presentation/controllers/onboarding_controller.dart';
import 'package:kaaj/features/trust_safety/presentation/trust_safety_providers.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';
import 'package:mocktail/mocktail.dart';

import '../support/pump_app.dart';

void main() {
  setUpAll(() => registerFallbackValue(<String, dynamic>{}));

  testWidgets('a pinned work site is sent with the job, rounded', (
    tester,
  ) async {
    final harness = _Harness(
      reading: _reading(accuracyM: 12.300000190734863, mockLocation: false),
    );
    await harness.pump(tester);

    await tester.tap(find.text('Pin the work site'));
    await tester.pumpAndSettle();
    expect(find.text('Work site pinned'), findsOneWidget);
    await harness.publish(tester);

    expect(harness.payload, containsPair('lat', 24.374012));
    expect(harness.payload, containsPair('lng', 88.601235));
  });

  testWidgets('a mocked location is refused and nothing is pinned', (
    tester,
  ) async {
    final harness = _Harness(
      reading: _reading(accuracyM: 5, mockLocation: true),
    );
    await harness.pump(tester);

    await tester.tap(find.text('Pin the work site'));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Could not get an accurate location. Move to an open area and try again.',
      ),
      findsOneWidget,
    );
    await harness.publish(tester);

    expect(harness.payload.containsKey('lat'), isFalse);
    expect(harness.payload.containsKey('lng'), isFalse);
  });

  testWidgets('a vague location is refused', (tester) async {
    final harness = _Harness(
      reading: _reading(accuracyM: 250, mockLocation: false),
    );
    await harness.pump(tester);

    await tester.tap(find.text('Pin the work site'));
    await tester.pumpAndSettle();

    expect(find.text('Work site pinned'), findsNothing);
  });

  testWidgets('denied location permission explains what to do', (tester) async {
    final harness = _Harness(
      reading: _reading(accuracyM: 5, mockLocation: false),
      permission: KPermissionStatus.denied,
    );
    await harness.pump(tester);

    await tester.tap(find.text('Pin the work site'));
    await tester.pumpAndSettle();

    expect(find.text('Allow location access, then try again.'), findsOneWidget);
    expect(harness.locationReads, 0);
  });

  testWidgets('a retry of the same post reuses its idempotency key (R7)', (
    tester,
  ) async {
    final harness = _Harness(
      reading: _reading(accuracyM: 12, mockLocation: false),
    );
    await harness.pump(tester);
    await harness.publish(tester);
    await harness.submitAgain(tester);
    expect(harness.keys, hasLength(2));
    expect(harness.keys.first, isNotNull);
    expect(harness.keys[1], harness.keys.first);

    // An edited post is a new request with a new key.
    tester
            .widgetList<KTextField>(find.byType(KTextField))
            .first
            .controller!
            .text =
        'Fix the bathroom tap';
    await harness.submitAgain(tester);
    expect(harness.keys, hasLength(3));
    expect(harness.keys[2], isNot(harness.keys.first));
  });

  testWidgets('the pin is optional and can be removed', (tester) async {
    final harness = _Harness(
      reading: _reading(accuracyM: 5, mockLocation: false),
    );
    await harness.pump(tester);

    await tester.tap(find.text('Pin the work site'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove pin'));
    await tester.pumpAndSettle();
    await harness.publish(tester);

    expect(find.text('Pin the work site'), findsOneWidget);
    expect(harness.payload.containsKey('lat'), isFalse);
  });
}

KLocation _reading({required double accuracyM, required bool mockLocation}) =>
    KLocation(
      latitude: 24.374012345678912,
      longitude: 88.601234567891234,
      accuracyM: accuracyM,
      capturedAt: DateTime.utc(2026, 11, 11, 6),
      mockLocation: mockLocation,
    );

class _Harness {
  _Harness({
    required this.reading,
    this.permission = KPermissionStatus.granted,
  });

  final KLocation reading;
  final KPermissionStatus permission;
  final repository = _MockJobsRepository();
  Map<String, dynamic> payload = const {};
  final keys = <String?>[];
  int locationReads = 0;

  Future<void> pump(WidgetTester tester) async {
    final onboarding = _MockOnboardingRepository();
    when(onboarding.restore).thenReturn(
      const OnboardingState(
        role: KaajRole.customer,
        complete: true,
        locationId: 'area-1',
      ),
    );
    // Capture the request, then fail it so the screen stays open (a success
    // would pop a route that this isolated test does not have).
    when(
      () => repository.createAndPublishJob(
        any(),
        actionKey: any(named: 'actionKey'),
      ),
    ).thenAnswer((call) async {
      payload = Map.of(call.positionalArguments.first as Map<String, dynamic>);
      keys.add(call.namedArguments[#actionKey] as String?);
      throw StateError('captured');
    });
    const size = Size(360, 1400);
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          categoryTreeProvider.overrideWith(
            (ref) async => const [
              CatalogCategory(
                id: 'plumbing',
                slug: 'plumbing',
                nameEn: 'Plumbing',
                nameBn: 'প্লাম্বিং',
                sortOrder: 1,
                icon: 'plumbing',
              ),
            ],
          ),
          catalogSkillsProvider.overrideWith((ref) async => []),
          onboardingControllerProvider.overrideWith(
            (ref) => OnboardingController(onboarding),
          ),
          meAs(KaajRole.customer),
          jobsRepositoryProvider.overrideWithValue(repository),
          locationGatewayProvider.overrideWithValue(
            _FakeLocationGateway(() {
              locationReads += 1;
              return reading;
            }),
          ),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          locale: const Locale('en'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          home: MediaQuery(
            data: const MediaQueryData(size: size),
            child: CreateJobScreen(
              permissionGateway: _FixedPermissionGateway(permission),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> publish(WidgetTester tester) async {
    final fields = tester
        .widgetList<KTextField>(find.byType(KTextField))
        .toList();
    fields[0].controller!.text = 'Fix the kitchen tap';
    fields[1].controller!.text =
        'The kitchen tap leaks and needs a new washer fitted.';
    fields[2].controller!.text = '500';
    tester
        .state<FormFieldState<String>>(
          find.byType(DropdownButtonFormField<String>).first,
        )
        .didChange('plumbing');
    await submitAgain(tester);
    verify(
      () => repository.createAndPublishJob(
        any(),
        actionKey: any(named: 'actionKey'),
      ),
    ).called(1);
  }

  Future<void> submitAgain(WidgetTester tester) async {
    tester.widget<KPrimaryButton>(find.byType(KPrimaryButton)).onPressed!();
    await tester.pumpAndSettle();
  }
}

class _FakeLocationGateway extends LocationGateway {
  const _FakeLocationGateway(this._read);

  final KLocation Function() _read;

  @override
  Future<KLocation> current() async => _read();
}

class _FixedPermissionGateway extends PermissionGateway {
  const _FixedPermissionGateway(this._status);

  final KPermissionStatus _status;

  @override
  Future<KPermissionStatus> request(KPermission permission) async => _status;
}

class _MockJobsRepository extends Mock implements JobsRepository {}

class _MockOnboardingRepository extends Mock implements OnboardingRepository {}

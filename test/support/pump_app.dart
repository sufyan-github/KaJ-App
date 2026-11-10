import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kaaj/core/routing/app_router.dart';
import 'package:kaaj/core/theme/app_theme.dart';
import 'package:kaaj/features/auth/domain/repositories/auth_repository.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';
import 'package:kaaj/features/help/presentation/help_centre_screen.dart';
import 'package:kaaj/features/jobs/presentation/screens/job_alerts_screen.dart';
import 'package:kaaj/features/jobs/presentation/screens/job_detail_screen.dart';
import 'package:kaaj/features/onboarding/data/onboarding_repository.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/onboarding/presentation/controllers/onboarding_controller.dart';
import 'package:kaaj/features/onboarding/presentation/screens/onboarding_screens.dart';
import 'package:kaaj/features/profile/presentation/screens/edit_profile_screen.dart';
import 'package:kaaj/features/training/data/training_offer_store.dart';
import 'package:kaaj/features/training/presentation/screens/certificates_screen.dart';
import 'package:kaaj/features/training/presentation/screens/course_screen.dart';
import 'package:kaaj/features/training/presentation/screens/training_catalog_screen.dart';
import 'package:kaaj/features/training/presentation/screens/training_test_screen.dart';
import 'package:kaaj/features/training/presentation/training_providers.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';
import 'package:mocktail/mocktail.dart';

import 'fake_api.dart';

class MockOnboardingRepository extends Mock implements OnboardingRepository {}

class MockAuthRepository extends Mock implements AuthRepository {}

/// An auth controller that is already fully signed in.
AuthController signedInAuth() => AuthController(MockAuthRepository())
  ..passwordLoginSucceeded()
  ..resolveAccess(allowed: true, needsPassword: false);

OnboardingController onboardingFor(
  KaajRole role, {
  bool complete = true,
  MockOnboardingRepository? repository,
}) {
  final mock = repository ?? MockOnboardingRepository();
  when(
    mock.restore,
  ).thenReturn(OnboardingState(role: role, complete: complete));
  when(() => mock.persist(any())).thenAnswer((_) async {});
  return OnboardingController(mock);
}

/// Routes for the screens under test. Anything else lands on a marker page
/// so a test can assert where a button went.
List<RouteBase> testRoutes({Widget? home}) => [
  GoRoute(
    path: '/',
    builder: (_, _) => home ?? const Scaffold(body: Text('start')),
  ),
  GoRoute(
    path: AppRoutes.training,
    builder: (_, _) => const TrainingCatalogScreen(),
  ),
  GoRoute(
    path: AppRoutes.trainingCertificates,
    builder: (_, _) => const CertificatesScreen(),
  ),
  GoRoute(
    path: AppRoutes.trainingCoursePath,
    builder: (_, state) => CourseScreen(courseId: state.pathParameters['id']!),
  ),
  GoRoute(
    path: AppRoutes.trainingTestPath,
    builder: (_, state) =>
        TrainingTestScreen(courseId: state.pathParameters['id']!),
  ),
  GoRoute(
    path: AppRoutes.jobDetailPath,
    builder: (_, state) => JobDetailScreen(jobId: state.pathParameters['id']!),
  ),
  GoRoute(
    path: AppRoutes.jobAlerts,
    builder: (_, _) => const JobAlertsScreen(),
  ),
  GoRoute(
    path: AppRoutes.editProfile,
    builder: (_, _) => const EditProfileScreen(),
  ),
  GoRoute(path: AppRoutes.help, builder: (_, _) => const HelpCentreScreen()),
  GoRoute(
    path: AppRoutes.editWorkerSkills,
    builder: (_, _) => const WorkerSkillsScreen(isEditing: true),
  ),
];

Future<GoRouter> pumpRouted(
  WidgetTester tester, {
  required FakeApi api,
  String initial = '/',
  Widget? home,
  List<Override> overrides = const [],
  Locale locale = const Locale('en'),
  Size size = const Size(400, 1000),
  TrainingOfferStore? offerStore,
  DateTime? now,
}) async {
  await tester.binding.setSurfaceSize(size);
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final router = GoRouter(
    initialLocation: initial,
    routes: testRoutes(home: home),
    errorBuilder: (_, state) => Scaffold(body: Text('route:${state.uri}')),
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        dioProvider.overrideWithValue(api.dio()),
        onMobileDataProvider.overrideWith((ref) async => false),
        trainingOfferStoreProvider.overrideWithValue(
          offerStore ?? MemoryTrainingOfferStore(),
        ),
        trainingClockProvider.overrideWithValue(
          () => now ?? DateTime.utc(2026, 11, 11, 9),
        ),
        ...overrides,
      ],
      child: MaterialApp.router(
        theme: buildAppTheme(),
        locale: locale,
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

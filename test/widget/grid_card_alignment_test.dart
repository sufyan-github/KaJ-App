import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/formatting/money.dart';
import 'package:kaaj/core/theme/app_theme.dart';
import 'package:kaaj/features/auth/domain/repositories/auth_repository.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_category.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_skill.dart';
import 'package:kaaj/features/catalog/presentation/controllers/catalog_providers.dart';
import 'package:kaaj/features/home/presentation/screens/home_screen.dart';
import 'package:kaaj/features/jobs/domain/job_models.dart';
import 'package:kaaj/features/jobs/presentation/controllers/jobs_providers.dart';
import 'package:kaaj/features/jobs/presentation/screens/jobs_screens.dart';
import 'package:kaaj/features/notifications/domain/app_notification.dart';
import 'package:kaaj/features/notifications/presentation/controllers/notifications_providers.dart';
import 'package:kaaj/features/onboarding/data/onboarding_repository.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/onboarding/presentation/controllers/onboarding_controller.dart';
import 'package:kaaj/features/profile/domain/public_worker_profile.dart';
import 'package:kaaj/features/profile/presentation/controllers/public_profile_provider.dart';
import 'package:kaaj/features/profile/presentation/screens/phase2_hub_screens.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';
import 'package:mocktail/mocktail.dart';

void main() {
  testWidgets('dashboard grid stays balanced at normal text size', (
    tester,
  ) async {
    final onboarding = _MockOnboardingRepository();
    final auth = _MockAuthRepository();
    when(
      onboarding.restore,
    ).thenReturn(const OnboardingState(role: KaajRole.worker, complete: true));

    await _pump(
      tester,
      const HomeScreen(),
      textScale: 1,
      overrides: [
        onboardingControllerProvider.overrideWith(
          (ref) => OnboardingController(onboarding),
        ),
        authControllerProvider.overrideWith((ref) => AuthController(auth)),
        notificationsProvider.overrideWith(
          (ref) async => const NotificationInbox(items: [], unreadCount: 0),
        ),
      ],
    );

    expect(tester.takeException(), isNull);
  });

  testWidgets('dashboard grid centers its content at 200% text', (
    tester,
  ) async {
    final onboarding = _MockOnboardingRepository();
    final auth = _MockAuthRepository();
    when(
      onboarding.restore,
    ).thenReturn(const OnboardingState(role: KaajRole.worker, complete: true));

    await _pump(
      tester,
      const HomeScreen(),
      overrides: [
        onboardingControllerProvider.overrideWith(
          (ref) => OnboardingController(onboarding),
        ),
        authControllerProvider.overrideWith((ref) => AuthController(auth)),
        notificationsProvider.overrideWith(
          (ref) async => const NotificationInbox(items: [], unreadCount: 0),
        ),
      ],
    );

    expect(
      tester.widget<Text>(find.text('কাজ খুঁজুন')).textAlign,
      TextAlign.center,
    );
    expect(
      tester.widget<Text>(find.text('খালি কাজ ও সময় দেখুন')).textAlign,
      TextAlign.center,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('work-type and subtype grid cards stay centered at 200% text', (
    tester,
  ) async {
    const category = CatalogCategory(
      id: 'category-1',
      slug: 'home-service',
      nameEn: 'Home service',
      nameBn: 'বাসার সেবা',
      sortOrder: 1,
      icon: 'home',
    );
    const skill = CatalogSkill(
      id: 'skill-1',
      slug: 'cleaning',
      nameEn: 'Cleaning',
      nameBn: 'ঘর পরিষ্কার',
      categoryId: 'category-1',
    );
    await _pump(
      tester,
      const CategoriesBrowseScreen(),
      overrides: [
        categoryTreeProvider.overrideWith((ref) async => const [category]),
        catalogSkillsProvider.overrideWith((ref) async => const [skill]),
      ],
    );

    expect(
      tester.widget<Text>(find.text('বাসার সেবা')).textAlign,
      TextAlign.center,
    );
    expect(find.text('১টি উপধরন'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('বাসার সেবা'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<Text>(find.text('ঘর পরিষ্কার')).textAlign,
      TextAlign.center,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('job grid centers full card data at normal and 200% text', (
    tester,
  ) async {
    final onboarding = _MockOnboardingRepository();
    when(
      onboarding.restore,
    ).thenReturn(const OnboardingState(role: KaajRole.worker, complete: true));
    final startsAt = DateTime.utc(2026, 9, 10, 10);
    final job = JobSummary(
      id: 'job-1',
      title: 'বাসার বৈদ্যুতিক তার ও সুইচ মেরামত',
      description: 'নিরাপদভাবে পুরোনো তার পরীক্ষা করে নষ্ট সুইচ বদলাতে হবে।',
      categoryId: 'category-1',
      categoryName: 'বাসার সেবা',
      locationName: 'রাজশাহী সদর',
      status: 'PUBLISHED',
      skills: const ['ইলেকট্রিক কাজ'],
      startsAt: startsAt,
      budgetMaxPoisha: const Money(150000),
      matchScore: 92,
      matchReasons: const ['SKILL_MATCH'],
      timeCompatibility: 'AVAILABLE',
    );

    for (final textScale in [1.0, 2.0]) {
      await _pump(
        tester,
        const JobFeedScreen(),
        textScale: textScale,
        overrides: [
          onboardingControllerProvider.overrideWith(
            (ref) => OnboardingController(onboarding),
          ),
          jobFeedProvider.overrideWith((ref, filter) async => [job]),
        ],
      );

      expect(
        tester
            .widget<Text>(find.text('বাসার বৈদ্যুতিক তার ও সুইচ মেরামত'))
            .textAlign,
        TextAlign.center,
      );
      expect(
        tester.widget<Text>(find.text('✓ আপনার সময়ে মেলে')).textAlign,
        TextAlign.center,
      );
      expect(tester.takeException(), isNull);
    }

    await _pump(
      tester,
      const JobFeedScreen(),
      textScale: 1,
      surfaceSize: const Size(480, 840),
      overrides: [
        onboardingControllerProvider.overrideWith(
          (ref) => OnboardingController(onboarding),
        ),
        jobFeedProvider.overrideWith((ref, filter) async => [job]),
      ],
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('worker cards center profile data at normal and 200% text', (
    tester,
  ) async {
    const worker = PublicWorkerProfile(
      id: 'worker-1',
      displayName: 'রহিম ইলেকট্রিশিয়ান',
      trustLevel: 'VERIFIED',
      ratingAverage: '4.9',
      ratingCount: 17,
      completedJobsCount: 32,
      areaNameBn: 'রাজশাহী সদর',
      skills: [
        PublicWorkerSkill(
          id: 'skill-1',
          nameBn: 'বৈদ্যুতিক কাজ',
          level: 'EXPERT',
          isVerified: true,
        ),
      ],
      availability: [],
    );
    for (final textScale in [1.0, 2.0]) {
      await _pump(
        tester,
        const WorkerDirectoryScreen(),
        textScale: textScale,
        overrides: [
          workerDirectoryProvider.overrideWith((ref) async => const [worker]),
        ],
      );

      expect(
        tester.widget<Text>(find.text('রহিম ইলেকট্রিশিয়ান')).textAlign,
        TextAlign.center,
      );
      expect(
        tester.widget<Text>(find.text('রাজশাহী সদর')).textAlign,
        TextAlign.center,
      );
      expect(tester.takeException(), isNull);
    }

    await _pump(
      tester,
      const WorkerDirectoryScreen(),
      textScale: 1,
      surfaceSize: const Size(480, 840),
      overrides: [
        workerDirectoryProvider.overrideWith((ref) async => const [worker]),
      ],
    );
    expect(tester.takeException(), isNull);
  });
}

Future<void> _pump(
  WidgetTester tester,
  Widget home, {
  List<Override> overrides = const [],
  double textScale = 2,
  Size surfaceSize = const Size(360, 760),
}) async {
  await tester.binding.setSurfaceSize(surfaceSize);
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: buildAppTheme(),
        locale: const Locale('bn'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: MediaQuery(
          data: MediaQueryData(
            size: surfaceSize,
            textScaler: TextScaler.linear(textScale),
          ),
          child: home,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

class _MockAuthRepository extends Mock implements AuthRepository {}

class _MockOnboardingRepository extends Mock implements OnboardingRepository {}

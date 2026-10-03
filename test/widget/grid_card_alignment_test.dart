import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/formatting/money.dart';
import 'package:kaaj/core/theme/app_theme.dart';
import 'package:kaaj/core/widgets/k_primary_button.dart';
import 'package:kaaj/core/widgets/k_text_field.dart';
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
import 'package:kaaj/features/trust_safety/presentation/trust_safety_providers.dart';
import 'package:kaaj/features/trust_safety/presentation/verification_screens.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';
import 'package:mocktail/mocktail.dart';

void main() {
  for (final language in ['bn', 'en']) {
    testWidgets('job publishing explains missing area in $language', (
      tester,
    ) async {
      final onboarding = _MockOnboardingRepository();
      when(onboarding.restore).thenReturn(
        const OnboardingState(role: KaajRole.customer, complete: true),
      );
      await _pump(
        tester,
        const CreateJobScreen(),
        locale: Locale(language),
        textScale: 1,
        overrides: [
          categoryTreeProvider.overrideWith(
            (ref) async => const [
              CatalogCategory(
                id: 'test-category',
                slug: 'education',
                nameEn: 'Education',
                nameBn: 'শিক্ষা',
                sortOrder: 1,
                icon: 'school',
              ),
            ],
          ),
          catalogSkillsProvider.overrideWith((ref) async => []),
          onboardingControllerProvider.overrideWith(
            (ref) => OnboardingController(onboarding),
          ),
        ],
      );
      final fields = tester
          .widgetList<KTextField>(find.byType(KTextField))
          .toList();
      fields[0].controller!.text = 'Audit tuition';
      fields[1].controller!.text =
          'A sufficiently detailed isolated test description';
      fields[2].controller!.text = '500';
      tester
          .state<FormFieldState<String>>(
            find.byType(DropdownButtonFormField<String>).first,
          )
          .didChange('test-category');
      final publish = tester.widget<KPrimaryButton>(
        find.byType(KPrimaryButton),
      );
      publish.onPressed!();
      await tester.pump();
      expect(
        find.text(
          language == 'en'
              ? 'Choose your area in your profile before posting a job.'
              : 'কাজ পোস্ট করার আগে প্রোফাইলে আপনার এলাকা নির্বাচন করুন।',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
    testWidgets('empty job form errors use $language and never publish', (
      tester,
    ) async {
      await _pump(
        tester,
        const CreateJobScreen(),
        locale: Locale(language),
        textScale: 1,
        overrides: [
          categoryTreeProvider.overrideWith((ref) async => []),
          catalogSkillsProvider.overrideWith((ref) async => []),
        ],
      );
      final form = tester.state<FormState>(find.byType(Form));
      expect(form.validate(), isFalse);
      await tester.pumpAndSettle();
      for (var step = 0; step < 5; step++) {
        final copy = tester
            .widgetList<Text>(find.byType(Text))
            .map((item) => item.data ?? '')
            .join(' ');
        if (language == 'en') {
          expect(copy, isNot(matches(RegExp(r'[\u0980-\u09FF]'))));
        }
        expect(tester.takeException(), isNull);
        await tester.drag(find.byType(ListView), const Offset(0, -220));
        await tester.pumpAndSettle();
      }
      expect(find.text('Step 1 / 3'), findsNothing);
    });
    testWidgets(
      'verification centre fully localizes to $language at 200% text',
      (tester) async {
        await _pump(
          tester,
          const VerificationCenterScreen(),
          locale: Locale(language),
          overrides: [
            verificationRequestsProvider.overrideWith((ref) async => []),
          ],
        );
        for (var step = 0; step < 5; step++) {
          final copy = tester
              .widgetList<Text>(find.byType(Text))
              .map((item) => item.data ?? '')
              .join(' ');
          if (language == 'en') {
            expect(copy, isNot(matches(RegExp(r'[\u0980-\u09FF]'))));
          }
          expect(tester.takeException(), isNull);
          await tester.drag(find.byType(ListView), const Offset(0, -250));
          await tester.pumpAndSettle();
        }
      },
    );
    testWidgets('navigation labels match $language locale', (tester) async {
      final onboarding = _MockOnboardingRepository();
      final auth = _MockAuthRepository();
      when(onboarding.restore).thenReturn(
        const OnboardingState(role: KaajRole.worker, complete: true),
      );
      await _pump(
        tester,
        const HomeScreen(),
        locale: Locale(language),
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
      final labels = tester
          .widgetList<NavigationDestination>(find.byType(NavigationDestination))
          .map((item) => item.label)
          .toList();
      expect(
        labels,
        language == 'en'
            ? ['Home', 'Search', 'My work', 'Messages', 'Profile']
            : ['হোম', 'খুঁজুন', 'আমার কাজ', 'বার্তা', 'প্রোফাইল'],
      );
      expect(tester.takeException(), isNull);
    });
    testWidgets(
      'incomplete worker card has readable $language fallbacks at 200% text',
      (tester) async {
        const worker = PublicWorkerProfile(
          id: 'incomplete',
          displayName: '  ',
          trustLevel: 'BASIC',
          ratingAverage: '0',
          ratingCount: 0,
          completedJobsCount: 0,
          skills: [],
          availability: [],
          areaNameBn: ' ',
        );
        await _pump(
          tester,
          const WorkerDirectoryScreen(),
          locale: Locale(language),
          overrides: [
            workerDirectoryProvider.overrideWith((ref) async => const [worker]),
          ],
        );
        expect(
          find.text(
            language == 'en' ? 'Name not provided' : 'নাম দেওয়া হয়নি',
          ),
          findsOneWidget,
        );
        expect(
          find.text(
            language == 'en' ? 'Area not provided' : 'এলাকা দেওয়া হয়নি',
          ),
          findsOneWidget,
        );
        expect(
          find.text(language == 'en' ? '★ 0 · 0 jobs' : '★ 0 · 0 কাজ'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
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
  Locale locale = const Locale('bn'),
}) async {
  await tester.binding.setSurfaceSize(surfaceSize);
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: buildAppTheme(),
        locale: locale,
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

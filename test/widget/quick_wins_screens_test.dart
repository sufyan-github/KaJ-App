import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/widgets/k_text_field.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_category.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_skill.dart';
import 'package:kaaj/features/catalog/domain/entities/service_location.dart';
import 'package:kaaj/features/catalog/presentation/controllers/catalog_providers.dart';
import 'package:kaaj/features/help/presentation/help_centre_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/onboarding/domain/worker_skill_input.dart';
import 'package:kaaj/features/onboarding/presentation/controllers/onboarding_controller.dart';
import 'package:mocktail/mocktail.dart';

import '../features/jobs/job_detail_alerts_repository_test.dart'
    show alertJson, jobDetailJson;
import '../features/profile/my_profile_repository_test.dart' show myProfileJson;
import '../support/fake_api.dart';
import '../support/pump_app.dart';

const _skills = [
  CatalogSkill(
    id: 'skill-1',
    slug: 'cleaning',
    nameEn: 'Cleaning',
    nameBn: 'পরিষ্কার',
    categoryId: 'cat-1',
  ),
  CatalogSkill(
    id: 'skill-2',
    slug: 'cooking',
    nameEn: 'Cooking',
    nameBn: 'রান্না',
    categoryId: 'cat-1',
  ),
];

const _locations = [
  ServiceLocation(
    id: 'loc-1',
    type: ServiceLocationType.area,
    nameEn: 'Boalia',
    nameBn: 'বোয়ালিয়া',
  ),
  ServiceLocation(
    id: 'loc-2',
    type: ServiceLocationType.area,
    nameEn: 'Shah Makhdum',
    nameBn: 'শাহ মখদুম',
  ),
];

final _catalogOverrides = <Override>[
  catalogSkillsProvider.overrideWith((ref) async => _skills),
  catalogLocationsProvider.overrideWith((ref) async => _locations),
  categoryTreeProvider.overrideWith(
    (ref) async => const [
      CatalogCategory(
        id: 'cat-1',
        slug: 'home',
        nameEn: 'Home services',
        nameBn: 'বাসার সেবা',
        sortOrder: 1,
      ),
    ],
  ),
];

void main() {
  setUpAll(() {
    registerFallbackValue(const OnboardingState());
    registerFallbackValue(<WorkerSkillInput>[]);
  });

  group('worker skills', () {
    testWidgets('preloads saved skills and maps the experience answers', (
      tester,
    ) async {
      final repository = MockOnboardingRepository();
      when(repository.getWorkerSkills).thenAnswer(
        (_) async => const [
          WorkerSkillInput(
            skillId: 'skill-1',
            level: 'ADVANCED',
            years: 4,
            hasPriorTraining: true,
          ),
        ],
      );
      List<WorkerSkillInput>? saved;
      when(
        () => repository.updateWorkerSkills(
          any(),
          hourlyRatePoisha: any(named: 'hourlyRatePoisha'),
        ),
      ).thenAnswer((call) async {
        saved = call.positionalArguments.first as List<WorkerSkillInput>;
      });
      await pumpRouted(
        tester,
        api: FakeApi(),
        initial: '/w/profile/skills',
        size: const Size(400, 1600),
        overrides: [
          onboardingControllerProvider.overrideWith(
            (ref) => onboardingFor(KaajRole.worker, repository: repository),
          ),
          ..._catalogOverrides,
        ],
      );

      // The saved skill is selected and shows its stored experience.
      expect(find.byKey(const ValueKey('experience-skill-1')), findsOneWidget);
      final expert = tester.widget<ChoiceChip>(
        find.descendant(
          of: find.byKey(const ValueKey('experience-skill-1')),
          matching: find.widgetWithText(ChoiceChip, 'Expert (3+ yrs)'),
        ),
      );
      expect(expert.selected, isTrue);

      await tester.tap(find.widgetWithText(FilterChip, 'Cooking'));
      await tester.pumpAndSettle();
      final cooking = find.byKey(const ValueKey('experience-skill-2'));
      expect(cooking, findsOneWidget);
      expect(
        find.descendant(
          of: cooking,
          matching: find.text('Any training or certificate?'),
        ),
        findsOneWidget,
      );
      await tester.tap(
        find.descendant(
          of: cooking,
          matching: find.text('Regularly (1–3 yrs)'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save skills'));
      await tester.pumpAndSettle();

      expect(saved, const [
        // Untouched: the stored level and years survive the save.
        WorkerSkillInput(
          skillId: 'skill-1',
          level: 'ADVANCED',
          years: 4,
          hasPriorTraining: true,
        ),
        WorkerSkillInput(skillId: 'skill-2', level: 'INTERMEDIATE', years: 2),
      ]);
      expect(find.text('route:/home'), findsOneWidget);
    });

    testWidgets('saving waits until the saved skills are loaded', (
      tester,
    ) async {
      final repository = MockOnboardingRepository();
      when(repository.getWorkerSkills).thenThrow(StateError('offline'));
      await pumpRouted(
        tester,
        api: FakeApi(),
        initial: '/w/profile/skills',
        overrides: [
          onboardingControllerProvider.overrideWith(
            (ref) => onboardingFor(KaajRole.worker, repository: repository),
          ),
          ..._catalogOverrides,
        ],
      );

      expect(
        find.text('Could not load your saved skills. Please try again.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Skip for now'));
      await tester.pumpAndSettle();
      verifyNever(
        () => repository.updateWorkerSkills(
          any(),
          hourlyRatePoisha: any(named: 'hourlyRatePoisha'),
        ),
      );
    });
  });

  group('job detail', () {
    FakeApi jobApi(Map<String, dynamic> job) => FakeApi()
      ..on('GET /jobs/job-1', FakeResponse.data(job))
      ..on(
        'GET /verification-requests/application-eligibility',
        FakeResponse.data({'canApply': true, 'identityStatus': 'APPROVED'}),
      );

    testWidgets('shows the job, poster badges and applies', (tester) async {
      final api = jobApi(jobDetailJson())
        ..on(
          'POST /jobs/job-1/applications',
          FakeResponse.data({}, status: 201),
        );
      await pumpRouted(
        tester,
        api: api,
        initial: '/jobs/job-1',
        overrides: [
          onboardingControllerProvider.overrideWith(
            (ref) => onboardingFor(KaajRole.worker),
          ),
        ],
      );

      expect(find.text('Kitchen deep clean'), findsOneWidget);
      expect(find.text('Cleaning › Kitchen'), findsOneWidget);
      expect(find.text('৳500 – ৳800'), findsOneWidget);
      expect(find.text('House cleaning'), findsOneWidget);
      expect(find.text('Boalia'), findsOneWidget);
      expect(find.text('Nasrin A.'), findsOneWidget);
      expect(find.text('Identity verified'), findsOneWidget);
      expect(find.text('Reliable'), findsOneWidget);
      expect(find.byKey(const ValueKey('job-applied')), findsNothing);

      api.on(
        'GET /jobs/job-1',
        FakeResponse.data(jobDetailJson(viewerApplicationStatus: 'PENDING')),
      );
      await tester.tap(find.byKey(const ValueKey('job-apply')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Submit application'));
      await tester.pumpAndSettle();

      expect(api.called('POST /jobs/job-1/applications'), hasLength(1));
      expect(find.byKey(const ValueKey('job-applied')), findsOneWidget);
      expect(find.text('Applied'), findsOneWidget);
    });

    testWidgets('an existing application shows the applied state', (
      tester,
    ) async {
      await pumpRouted(
        tester,
        api: jobApi(jobDetailJson(viewerApplicationStatus: 'ACCEPTED')),
        initial: '/jobs/job-1',
        overrides: [
          onboardingControllerProvider.overrideWith(
            (ref) => onboardingFor(KaajRole.worker),
          ),
        ],
      );

      expect(find.byKey(const ValueKey('job-apply')), findsNothing);
      expect(find.text('Applied'), findsOneWidget);
      expect(find.textContaining('Application status:'), findsOneWidget);
    });

    testWidgets('the poster sees their own post without apply', (tester) async {
      await pumpRouted(
        tester,
        api: jobApi(jobDetailJson(viewerIsPoster: true)),
        initial: '/jobs/job-1',
        overrides: [
          onboardingControllerProvider.overrideWith(
            (ref) => onboardingFor(KaajRole.worker),
          ),
        ],
      );

      expect(find.byKey(const ValueKey('job-apply')), findsNothing);
      expect(find.text('This is a job you posted.'), findsOneWidget);
    });
  });

  group('job alerts', () {
    testWidgets('creates an alert from filters and deletes one', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /me/job-alerts',
          FakeResponse.data({
            'items': [alertJson()],
          }),
        )
        ..on(
          'POST /me/job-alerts',
          FakeResponse.data(alertJson(id: 'alert-2'), status: 201),
        )
        ..on('DELETE /me/job-alerts/alert-1', const FakeResponse(204));
      await pumpRouted(
        tester,
        api: api,
        initial: '/settings/job-alerts',
        overrides: _catalogOverrides,
      );

      expect(find.text('Cleaning · Boalia'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('add-job-alert')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('alert-location')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Shah Makhdum').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('save-job-alert')));
      await tester.pumpAndSettle();
      expect(api.called('POST /me/job-alerts').single.data, {
        'locationId': 'loc-2',
      });

      api.on('GET /me/job-alerts', FakeResponse.data({'items': []}));
      await tester.tap(find.byKey(const ValueKey('delete-job-alert-alert-1')));
      await tester.pumpAndSettle();
      expect(api.called('DELETE /me/job-alerts/alert-1'), hasLength(1));
      expect(find.text('No job alerts'), findsOneWidget);
    });

    testWidgets('the limit is explained', (tester) async {
      final api = FakeApi()
        ..on('GET /me/job-alerts', FakeResponse.data({'items': []}))
        ..on('POST /me/job-alerts', FakeResponse.error(409, 'JOB_ALERT_LIMIT'));
      await pumpRouted(
        tester,
        api: api,
        initial: '/settings/job-alerts',
        overrides: _catalogOverrides,
      );
      await tester.tap(find.byKey(const ValueKey('add-job-alert')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('alert-location')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Boalia').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('save-job-alert')));
      await tester.pumpAndSettle();

      expect(
        find.text(
          'You can keep up to 10 job alerts. Delete one to add a new one.',
        ),
        findsOneWidget,
      );
    });
  });

  group('edit profile', () {
    testWidgets('shows completeness rows and saves name, bio and area', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET /profiles/me', FakeResponse.data(myProfileJson()))
        ..on('PUT /profiles/me', FakeResponse.data({}));
      await pumpRouted(
        tester,
        api: api,
        initial: '/profile/edit',
        size: const Size(400, 1400),
        overrides: _catalogOverrides,
      );

      expect(find.text('Complete your profile'), findsOneWidget);
      expect(find.text('50% complete'), findsOneWidget);
      expect(find.text('Add a profile photo'), findsOneWidget);
      expect(find.text('Write a short bio'), findsOneWidget);
      expect(find.text('Take an optional training test'), findsOneWidget);
      expect(find.text('Verify your identity'), findsNothing);

      final fields = tester
          .widgetList<KTextField>(find.byType(KTextField))
          .toList();
      expect(fields[0].controller!.text, 'Rahim');
      fields[1].controller!.text = 'I clean homes in Rajshahi.';
      api.on(
        'GET /profiles/me',
        FakeResponse.data(myProfileJson(percent: 100, missing: [])),
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(api.called('PUT /profiles/me').single.data, {
        'displayName': 'Rahim',
        'bio': 'I clean homes in Rajshahi.',
        'primaryLocationId': 'loc-1',
      });
      expect(find.text('Profile saved.'), findsOneWidget);
      expect(find.text('Complete your profile'), findsNothing);
    });

    testWidgets('a completeness row opens the place to fix it', (tester) async {
      final api = FakeApi()
        ..on(
          'GET /profiles/me',
          FakeResponse.data(myProfileJson(missing: ['IDENTITY'])),
        );
      await pumpRouted(
        tester,
        api: api,
        initial: '/profile/edit',
        overrides: _catalogOverrides,
      );
      await tester.tap(find.text('Verify your identity'));
      await tester.pumpAndSettle();
      expect(find.text('route:/verification'), findsOneWidget);
    });
  });

  group('help centre', () {
    for (final language in ['bn', 'en']) {
      testWidgets('renders every topic in $language', (tester) async {
        await pumpRouted(
          tester,
          api: FakeApi(),
          initial: '/help',
          locale: Locale(language),
          size: const Size(400, 1800),
        );
        final english = language == 'en';
        expect(
          find.text(english ? 'Help centre' : 'সহায়তা কেন্দ্র'),
          findsOneWidget,
        );
        expect(find.byType(ExpansionTile), findsNWidgets(helpTopics.length));
        await tester.tap(
          find.text(
            english ? 'Training and certificates' : 'প্রশিক্ষণ ও সার্টিফিকেট',
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.text(
            english ? 'Is training required?' : 'প্রশিক্ষণ কি বাধ্যতামূলক?',
          ),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('help-support-contact')),
          findsOneWidget,
        );
        if (english) {
          final bangla = RegExp(r'[ঀ-৿]');
          final texts = tester
              .widgetList<Text>(find.byType(Text))
              .map((text) => text.data ?? '');
          expect(texts.where(bangla.hasMatch), isEmpty);
        }
      });
    }
  });
}

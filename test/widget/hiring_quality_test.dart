import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/widgets/k_primary_button.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_category.dart';
import 'package:kaaj/features/catalog/domain/entities/catalog_skill.dart';
import 'package:kaaj/features/catalog/presentation/controllers/catalog_providers.dart';
import 'package:kaaj/features/home/presentation/screens/home_screen.dart';
import 'package:kaaj/features/jobs/data/jobs_repository.dart';
import 'package:kaaj/features/jobs/domain/job_models.dart';
import 'package:kaaj/features/jobs/presentation/screens/jobs_screens.dart';
import 'package:kaaj/features/jobs/presentation/widgets/review_dialog.dart';
import 'package:kaaj/features/notifications/domain/app_notification.dart';
import 'package:kaaj/features/notifications/presentation/controllers/notifications_providers.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _job(String id, String status) => {
  'id': id,
  'title': 'Fix the kitchen tap',
  'description': 'A dripping tap needs a new washer.',
  'status': status,
  'category': {'id': 'cat-1', 'name_bn': 'মেরামত', 'name_en': 'Repairs'},
  'location': {'name_bn': 'বোয়ালিয়া', 'name_en': 'Boalia'},
  'skills': <Object>[],
  'budget_min_poisha': '50000',
  'budget_max_poisha': '50000',
};

Map<String, dynamic> _application({Map<String, dynamic>? worker}) => {
  'id': 'app-1',
  'jobId': 'job-1',
  'workerUserId': '1a2b3c4d-0000-4000-8000-000000000001',
  'status': 'PENDING',
  'message': 'I can come tomorrow morning.',
  'proposedPricePoisha': '45000',
  'proposedStartsAt': null,
  'proposedEndsAt': null,
  'worker': ?worker,
};

Map<String, dynamic> _publicWorker({
  List<Map<String, dynamic>>? skills,
  String trustLevel = 'IDENTITY',
}) => {
  'id': 'worker-1',
  'displayName': 'Karim',
  'trustLevel': trustLevel,
  'ratingAverage': '4.6',
  'ratingCount': 12,
  'completedJobsCount': 20,
  'skills':
      skills ??
      [
        {
          'id': 'skill-plumb',
          'nameBn': 'প্লাম্বিং',
          'nameEn': 'Plumbing',
          'level': 'EXPERT',
        },
        {
          'id': 'skill-elec',
          'nameBn': 'ইলেকট্রিক',
          'nameEn': 'Electrical',
          'level': 'INTERMEDIATE',
        },
      ],
  'availability': <String>[],
};

const _catalogSkills = [
  CatalogSkill(
    id: 'skill-plumb',
    slug: 'plumbing',
    nameEn: 'Plumbing',
    nameBn: 'প্লাম্বিং',
    categoryId: 'cat-1',
  ),
  CatalogSkill(
    id: 'skill-elec',
    slug: 'electrical',
    nameEn: 'Electrical',
    nameBn: 'ইলেকট্রিক',
    categoryId: 'cat-2',
  ),
];

void main() {
  group('applicant summary parsing', () {
    test('reads the summary under any of its names', () {
      for (final key in ['worker', 'applicant', 'workerSummary']) {
        final parsed = JobApplicationSummary.fromJson({
          'id': 'a',
          'workerUserId': 'w',
          key: {
            'displayName': 'Karim',
            'ratingAverage': '4.5',
            'ratingCount': 3,
            'trustLevel': 'IDENTITY',
          },
        });
        expect(parsed.applicant?.displayName, 'Karim', reason: key);
        expect(parsed.applicant?.ratingAverage, 4.5);
        expect(parsed.applicant?.identityVerified, isTrue);
      }
    });

    test('reads the backend applicant shape', () {
      final parsed = JobApplicationSummary.fromJson({
        'id': 'a',
        'workerUserId': 'w',
        'applicant': {
          'userId': 'w',
          'displayName': 'Karim U.',
          'trustLevel': 'IDENTITY',
          'isVerified': false,
          'ratingAverage': '4.20',
          'ratingCount': 5,
          'completedJobsCount': 7,
          'badges': <Object>[],
        },
      });
      final applicant = parsed.applicant!;
      expect(applicant.displayName, 'Karim U.');
      expect(applicant.identityVerified, isFalse);
      expect(applicant.ratingAverage, 4.2);
      expect(applicant.ratingCount, 5);
      expect(applicant.completedJobsCount, 7);
    });

    test('an older API without a summary still parses', () {
      final parsed = JobApplicationSummary.fromJson(_application());
      expect(parsed.applicant, isNull);
      expect(parsed.fallbackLabel, '1a2b3c4d');
    });
  });

  group('applicant card in the applications sheet', () {
    Future<FakeApi> openSheet(
      WidgetTester tester, {
      Map<String, dynamic>? worker,
      Locale locale = const Locale('en'),
    }) async {
      final api = FakeApi()
        ..on(
          'GET /jobs/mine',
          FakeResponse.data({
            'items': [_job('job-1', 'APPLICATIONS_OPEN')],
          }),
        )
        ..on(
          'GET /jobs/job-1/applications',
          FakeResponse.data({
            'items': [_application(worker: worker)],
          }),
        )
        ..on(
          'GET /jobs/job-1/suggested-workers',
          FakeResponse.data({'items': <Object>[]}),
        )
        ..on(
          'POST /applications/app-1/accept',
          FakeResponse.data({'id': 'asg-1'}),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const JobFeedScreen(),
        locale: locale,
        overrides: [meAs(KaajRole.customer)],
      );
      await tester.tap(
        find.text(
          locale.languageCode == 'en' ? 'See application' : 'আবেদন দেখুন',
        ),
      );
      await tester.pumpAndSettle();
      return api;
    }

    testWidgets('shows name, rating, verification and proposed price', (
      tester,
    ) async {
      final api = await openSheet(
        tester,
        worker: {
          'displayName': 'Karim Uddin',
          'ratingAverage': 4.6,
          'ratingCount': 12,
          'completedJobsCount': 20,
          'identityVerified': true,
        },
      );
      expect(find.text('Karim Uddin'), findsOneWidget);
      expect(find.textContaining('★ 4.6 (12)'), findsOneWidget);
      expect(find.textContaining('20 jobs done'), findsOneWidget);
      expect(find.text('Identity verified'), findsOneWidget);
      expect(find.textContaining('Proposed price'), findsOneWidget);
      expect(find.textContaining('450'), findsOneWidget);

      await tester.tap(find.text('Accept'));
      await tester.pumpAndSettle();
      expect(api.called('POST /applications/app-1/accept'), hasLength(1));
    });

    testWidgets('links to the applicant profile', (tester) async {
      await openSheet(tester, worker: {'displayName': 'Karim'});
      await tester.tap(find.text('View profile'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'route:/workers/1a2b3c4d-0000-4000-8000-000000000001/profile',
        ),
        findsOneWidget,
      );
    });

    for (final language in ['en', 'bn']) {
      testWidgets(
        'falls back to the short label without a summary ($language)',
        (tester) async {
          await openSheet(tester, locale: Locale(language));
          expect(
            find.text(language == 'en' ? 'Worker 1a2b3c4d' : 'কর্মী 1a2b3c4d'),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  });

  testWidgets('a draft in My jobs can be published', (tester) async {
    final api = FakeApi()
      ..on(
        'GET /jobs/mine',
        FakeResponse.data({
          'items': [_job('job-9', 'DRAFT')],
        }),
      )
      ..on('POST /jobs/job-9/publish', FakeResponse.data({'id': 'job-9'}));
    await pumpRouted(
      tester,
      api: api,
      home: const JobFeedScreen(),
      overrides: [meAs(KaajRole.customer)],
    );
    expect(find.text('See application'), findsNothing);
    await tester.tap(find.text('Publish'));
    await tester.pumpAndSettle();
    expect(api.called('POST /jobs/job-9/publish'), hasLength(1));
    expect(find.text('The job is published.'), findsOneWidget);
  });

  group('booking', () {
    FakeApi bookingApi({
      List<Map<String, dynamic>>? skills,
      String trustLevel = 'IDENTITY',
    }) => FakeApi()
      ..on(
        'GET /users/worker-1/public',
        FakeResponse.data(
          _publicWorker(skills: skills, trustLevel: trustLevel),
        ),
      )
      ..on(
        'GET /workers/worker-1/availability/slots',
        FakeResponse.data({
          'slots': [
            {
              'startsAt': '2026-11-20T04:00:00Z',
              'endsAt': '2026-11-20T06:00:00Z',
            },
          ],
        }),
      )
      ..on('GET /me/favorites', FakeResponse.data({'items': <Object>[]}))
      ..on(
        'POST /workers/worker-1/booking-requests',
        FakeResponse.data({'id': 'b-1'}),
      );

    Future<void> pickSlotAndBook(WidgetTester tester) async {
      await tester.tap(find.byType(ChoiceChip).last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byType(KPrimaryButton));
      await tester.tap(find.byType(KPrimaryButton));
      await tester.pumpAndSettle();
    }

    testWidgets('books the skill the customer picked', (tester) async {
      final api = bookingApi();
      await pumpRouted(
        tester,
        api: api,
        home: const WorkerBookingScreen(workerId: 'worker-1'),
        overrides: [
          meAs(KaajRole.customer),
          catalogSkillsProvider.overrideWith((ref) async => _catalogSkills),
        ],
      );
      expect(find.text('Which work is the booking for?'), findsOneWidget);
      await tester.tap(find.text('Electrical'));
      await tester.pumpAndSettle();
      await pickSlotAndBook(tester);
      await tester.enterText(find.byType(TextField).last, '600');
      await tester.tap(find.text('Send request'));
      await tester.pumpAndSettle();

      final body =
          api.called('POST /workers/worker-1/booking-requests').single.data!
              as Map;
      expect(body['skillId'], 'skill-elec');
      expect(body['categoryId'], 'cat-2');
      expect(body['locationId'], 'area-1');
    });

    for (final language in ['en', 'bn']) {
      testWidgets('explains that an unverified worker cannot be booked yet '
          '($language)', (tester) async {
        final api = bookingApi(trustLevel: 'PHONE');
        await pumpRouted(
          tester,
          api: api,
          home: const WorkerBookingScreen(workerId: 'worker-1'),
          locale: Locale(language),
          overrides: [
            meAs(KaajRole.customer),
            catalogSkillsProvider.overrideWith((ref) async => _catalogSkills),
          ],
        );
        expect(
          find.byKey(const ValueKey('booking-unverified')),
          findsOneWidget,
        );
        if (language == 'en') {
          expect(
            find.textContaining('has not verified their identity'),
            findsOneWidget,
          );
        }
        final button = tester.widget<KPrimaryButton>(
          find.byType(KPrimaryButton),
        );
        expect(button.onPressed, isNull);
      });
    }

    testWidgets('a refusal shows the server reason and code', (tester) async {
      final api = bookingApi()
        ..on(
          'POST /workers/worker-1/booking-requests',
          const FakeResponse(403, {
            'error': {
              'code': 'FORBIDDEN',
              'message':
                  'Approved identity verification with NID and selfie is '
                  'required before applying.',
            },
          }),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const WorkerBookingScreen(workerId: 'worker-1'),
        overrides: [
          meAs(KaajRole.customer),
          catalogSkillsProvider.overrideWith((ref) async => _catalogSkills),
        ],
      );
      await tester.tap(find.text('Electrical'));
      await tester.pumpAndSettle();
      await pickSlotAndBook(tester);
      await tester.enterText(find.byType(TextField).last, '600');
      await tester.tap(find.text('Send request'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining(
          'Approved identity verification with NID and selfie is required '
          'before applying. (FORBIDDEN)',
        ),
        findsOneWidget,
      );
    });

    testWidgets('says why when the area is missing', (tester) async {
      final api = bookingApi();
      await pumpRouted(
        tester,
        api: api,
        home: const WorkerBookingScreen(workerId: 'worker-1'),
        overrides: [
          meAs(KaajRole.customer, areaId: null),
          catalogSkillsProvider.overrideWith((ref) async => _catalogSkills),
        ],
      );
      await pickSlotAndBook(tester);
      expect(
        find.text(
          'Choose your area in your profile before requesting a booking.',
        ),
        findsOneWidget,
      );
      expect(api.called('POST /workers/worker-1/booking-requests'), isEmpty);
    });

    testWidgets('says why when the worker has no skills', (tester) async {
      final api = bookingApi(skills: const []);
      await pumpRouted(
        tester,
        api: api,
        home: const WorkerBookingScreen(workerId: 'worker-1'),
        overrides: [
          meAs(KaajRole.customer),
          catalogSkillsProvider.overrideWith((ref) async => _catalogSkills),
        ],
      );
      await pickSlotAndBook(tester);
      expect(
        find.text(
          'This worker has not added any skills yet, so they cannot be booked.',
        ),
        findsOneWidget,
      );
    });
  });

  group('reviews', () {
    testWidgets('sub-scores follow the overall rating until changed', (
      tester,
    ) async {
      ReviewInput? result;
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async => result = await showDialog<ReviewInput>(
                context: context,
                builder: (_) => const ReviewDialog(),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      // Overall 4 stars, then punctuality 2.
      await tester.tap(find.byTooltip('Overall rating: 4 of 5'));
      await tester.pump();
      await tester.tap(find.byTooltip('Punctuality: 2 of 5'));
      await tester.pump();
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();

      expect(result?.rating, 4);
      expect(result?.punctuality, 2);
      expect(result?.quality, 4);
      expect(result?.communication, 4);
      expect(result?.reliability, 4);
    });

    test('the repository sends the chosen sub-scores', () async {
      final api = FakeApi()
        ..on('POST /assignments/asg-1/reviews', FakeResponse.data({'id': 'r'}));
      await JobsRepository(api.dio()).submitReview(
        assignmentId: 'asg-1',
        review: const ReviewInput(
          rating: 4,
          punctuality: 2,
          quality: 5,
          communication: 3,
          reliability: 4,
          comment: ' late but tidy ',
        ),
      );
      expect(api.called('POST /assignments/asg-1/reviews').single.data, {
        'rating': 4,
        'punctuality': 2,
        'quality': 5,
        'communication': 3,
        'reliability': 4,
        'comment': 'late but tidy',
      });
    });
  });

  group('home shortcuts', () {
    final overrides = [
      notificationsProvider.overrideWith(
        (ref) async => const NotificationInbox(items: [], unreadCount: 0),
      ),
    ];

    testWidgets('worker shortcuts open real area and time filters', (
      tester,
    ) async {
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: const HomeScreen(),
        size: const Size(400, 2400),
        overrides: [...overrides, meAs(KaajRole.worker)],
      );
      await tester.tap(find.text('Near you'));
      await tester.pumpAndSettle();
      expect(
        find.text('route:/jobs?locationId=area-1&locationName=Boalia'),
        findsOneWidget,
      );
    });

    testWidgets('matching your availability turns on the time filter', (
      tester,
    ) async {
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: const HomeScreen(),
        size: const Size(400, 2400),
        overrides: [...overrides, meAs(KaajRole.worker)],
      );
      await tester.tap(find.text('Jobs matching your availability'));
      await tester.pumpAndSettle();
      expect(find.text('route:/jobs?availableOnly=true'), findsOneWidget);
    });

    testWidgets('customer shortcuts are real categories', (tester) async {
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: const HomeScreen(),
        size: const Size(400, 2400),
        overrides: [
          ...overrides,
          meAs(KaajRole.customer),
          categoryTreeProvider.overrideWith(
            (ref) async => const [
              CatalogCategory(
                id: 'cat-2',
                slug: 'electrical',
                nameEn: 'Electrical',
                nameBn: 'ইলেকট্রিক',
                sortOrder: 2,
              ),
              CatalogCategory(
                id: 'cat-1',
                slug: 'repair',
                nameEn: 'Repairs',
                nameBn: 'মেরামত',
                sortOrder: 1,
              ),
            ],
          ),
        ],
      );
      expect(find.text('Cleaning'), findsNothing);
      await tester.tap(find.text('Repairs'));
      await tester.pumpAndSettle();
      expect(
        find.text('route:/jobs?categoryId=cat-1&categoryName=Repairs'),
        findsOneWidget,
      );
    });
  });
}

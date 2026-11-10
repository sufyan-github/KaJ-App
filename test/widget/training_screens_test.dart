import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';
import 'package:kaaj/features/home/presentation/screens/home_screen.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/onboarding/presentation/controllers/onboarding_controller.dart';
import 'package:kaaj/features/settings/domain/settings_models.dart';
import 'package:kaaj/features/settings/presentation/settings_providers.dart';
import 'package:kaaj/features/training/data/training_offer_store.dart';
import 'package:kaaj/features/training/presentation/training_providers.dart';
import 'package:kaaj/features/training/presentation/widgets/training_offer_gate.dart';
import 'package:mocktail/mocktail.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';
import '../support/training_fixtures.dart';

final _rewardWords = RegExp(
  r'point|badge|reward|streak|completed|watched',
  caseSensitive: false,
);

void main() {
  setUpAll(() => registerFallbackValue(const OnboardingState()));

  group('catalog', () {
    testWidgets('lists my skill courses first with certificate state', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /training/courses',
          FakeResponse.data({
            'items': [
              courseJson(
                id: 'other',
                titleEn: 'Garden care',
                relevance: 'OTHER',
              ),
              courseJson(
                id: 'general',
                titleEn: 'Working safely',
                relevance: 'GENERAL',
                safety: true,
              ),
              courseJson(
                id: 'mine',
                titleEn: 'Safe home cleaning',
                certificate: certificateJson(courseId: 'mine'),
              ),
            ],
          }),
        );
      await pumpRouted(tester, api: api, initial: '/training');

      expect(api.requests.single.query, {'scope': 'all'});
      final y = [
        'Courses for your skills',
        'Safe home cleaning',
        'For all workers',
        'Working safely',
        'Other courses',
        'Garden care',
      ].map((text) => tester.getTopLeft(find.text(text)).dy).toList();
      expect(y, orderedEquals([...y]..sort()));
      expect(find.text('20 min'), findsNWidgets(3));
      expect(find.text('about 40 MB data'), findsNWidgets(3));
      expect(find.text('Safety'), findsOneWidget);
      expect(
        find.textContaining('Passed the Kaaj knowledge test'),
        findsOneWidget,
      );
      expect(find.text('Test not taken yet'), findsNWidgets(2));
    });
  });

  group('course', () {
    testWidgets(
      'shows the notes when the video is unavailable and never a watch reward',
      (tester) async {
        final api = FakeApi()
          ..on(
            'GET /training/courses/course-1',
            FakeResponse.data(courseDetailJson(safety: true)),
          )
          ..on('POST /training/lessons/lesson-1/open', const FakeResponse(204));
        await pumpRouted(
          tester,
          api: api,
          initial: '/training/courses/course-1',
          overrides: [
            lessonVideoBuilderProvider.overrideWithValue((context, request) {
              WidgetsBinding.instance.addPostFrameCallback(
                (_) => request.onError(150),
              );
              return const ColoredBox(color: Colors.black);
            }),
          ],
        );

        expect(find.byKey(const ValueKey('take-test')), findsOneWidget);
        expect(find.text('Take the test'), findsOneWidget);
        expect(find.textContaining('This is not a licence'), findsOneWidget);

        await tester.tap(find.text('Getting ready'));
        await tester.pumpAndSettle();
        expect(
          api.called('POST /training/lessons/lesson-1/open'),
          hasLength(1),
        );
        expect(
          find.text('This video uses about 40 MB of data.'),
          findsOneWidget,
        );
        expect(find.text('Wear gloves and open the windows.'), findsOneWidget);

        await tester.tap(find.text('Load video'));
        await tester.pump();
        final player = tester.getSize(
          find.byKey(const ValueKey('lesson-player')),
        );
        expect(player.width, greaterThanOrEqualTo(200));
        expect(player.height, greaterThanOrEqualTo(200));
        await tester.pumpAndSettle();

        expect(
          find.text('This video is unavailable — read the notes below'),
          findsOneWidget,
        );
        expect(find.text('Wear gloves and open the windows.'), findsOneWidget);
        expect(find.byKey(const ValueKey('take-test')), findsOneWidget);
        final texts = tester
            .widgetList<Text>(find.byType(Text))
            .map((text) => text.data ?? '')
            .where(_rewardWords.hasMatch);
        expect(texts, isEmpty);
      },
    );
  });

  group('test flow', () {
    FakeApi testApi({required bool passed}) => FakeApi()
      ..on(
        'POST /training/courses/course-1/attempts',
        FakeResponse.data(attemptJson(), status: 201),
      )
      ..on(
        'POST /training/attempts/attempt-1/submit',
        FakeResponse.data(resultJson(passed: passed)),
      )
      ..on(
        'GET /me/certificates',
        FakeResponse.data({
          'items': [certificateJson(safety: true)],
        }),
      );

    Future<void> answer(WidgetTester tester, String second) async {
      await tester.tap(find.byKey(const ValueKey('option-q1-a')));
      await tester.pump();
      expect(find.text('Answer every question to submit.'), findsOneWidget);
      await tester.tap(find.byKey(ValueKey('option-q2-$second')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('submit-test')));
      await tester.pumpAndSettle();
    }

    testWidgets('a pass shows the score and leads to the certificate', (
      tester,
    ) async {
      final api = testApi(passed: true);
      await pumpRouted(
        tester,
        api: api,
        initial: '/training/courses/course-1/test',
      );

      expect(find.text('1. What do you wear first?'), findsOneWidget);
      await answer(tester, 'b');

      expect(
        api.called('POST /training/attempts/attempt-1/submit').single.data,
        {
          'answers': [
            {'questionId': 'q1', 'optionId': 'a'},
            {'questionId': 'q2', 'optionId': 'b'},
          ],
        },
      );
      expect(find.text('You passed'), findsOneWidget);
      expect(find.text('Your score: 100% · pass mark 70%'), findsOneWidget);
      expect(find.text('Certificate code: K7Q2M9XW4P'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('open-certificates')));
      await tester.pumpAndSettle();
      expect(find.text('My certificates'), findsOneWidget);
      expect(find.text('Code: K7Q2M9XW4P'), findsOneWidget);
    });

    testWidgets('a fail shows each explanation and the correct answer', (
      tester,
    ) async {
      await pumpRouted(
        tester,
        api: testApi(passed: false),
        initial: '/training/courses/course-1/test',
      );
      await answer(tester, 'a');

      expect(find.text('Not passed this time'), findsOneWidget);
      expect(find.text('Your score: 50% · pass mark 70%'), findsOneWidget);
      expect(find.text('Mixing them releases toxic gas.'), findsOneWidget);
      expect(find.text('Gloves protect your skin.'), findsOneWidget);
      expect(find.text('Correct answer: Never'), findsOneWidget);
      expect(find.text('Take the test again'), findsOneWidget);
      expect(find.byKey(const ValueKey('open-certificates')), findsNothing);
    });

    testWidgets('the daily limit says when to try again', (tester) async {
      final api = FakeApi()
        ..on(
          'POST /training/courses/course-1/attempts',
          FakeResponse.error(
            409,
            'TRAINING_ATTEMPT_LIMIT',
            details: [
              {'nextAttemptAt': '2026-11-12T08:00:00.000Z'},
            ],
          ),
        );
      await pumpRouted(
        tester,
        api: api,
        initial: '/training/courses/course-1/test',
      );

      final message = tester
          .widget<Text>(find.byKey(const ValueKey('test-start-problem')))
          .data!;
      expect(message, startsWith('You have used today’s three tries.'));
      expect(message, contains('Nov 12, 2026'));
    });

    testWidgets('an existing certificate is explained', (tester) async {
      final api = FakeApi()
        ..on(
          'POST /training/courses/course-1/attempts',
          FakeResponse.error(409, 'TRAINING_ALREADY_CERTIFIED'),
        );
      await pumpRouted(
        tester,
        api: api,
        initial: '/training/courses/course-1/test',
      );

      expect(
        find.text('You already have a certificate for this course.'),
        findsOneWidget,
      );
    });
  });

  group('certificates', () {
    for (final language in ['en', 'bn']) {
      testWidgets('state exactly what was checked in $language', (
        tester,
      ) async {
        final api = FakeApi()
          ..on(
            'GET /me/certificates',
            FakeResponse.data({
              'items': [
                certificateJson(safety: true),
                certificateJson(id: 'cert-2', courseId: 'course-2'),
              ],
            }),
          );
        await pumpRouted(
          tester,
          api: api,
          initial: '/training/certificates',
          locale: Locale(language),
        );

        final english = language == 'en';
        expect(
          find.text(
            english
                ? 'Passed the Kaaj knowledge test'
                : 'Kaaj জ্ঞান পরীক্ষায় উত্তীর্ণ',
          ),
          findsNWidgets(2),
        );
        expect(
          find.text(
            english ? 'This is not a licence' : 'এটি কোনো লাইসেন্স নয়',
          ),
          findsOneWidget,
        );
        expect(
          find.text(english ? 'Code: K7Q2M9XW4P' : 'কোড: K7Q2M9XW4P'),
          findsNWidgets(2),
        );
        final all = tester
            .widgetList<Text>(find.byType(Text))
            .map((text) => text.data ?? '')
            .join(' ');
        expect(
          all,
          isNot(
            matches(
              RegExp(
                'licensed|qualified|certified professional',
                caseSensitive: false,
              ),
            ),
          ),
        );
      });
    }
  });

  group('training offer', () {
    List<Override> offerOverrides({String role = 'WORKER'}) => [
      authControllerProvider.overrideWith((ref) => signedInAuth()),
      onboardingControllerProvider.overrideWith(
        (ref) => onboardingFor(
          role == 'WORKER' ? KaajRole.worker : KaajRole.customer,
        ),
      ),
      accountSummaryProvider.overrideWith(
        (ref) async => AccountSummary(
          id: 'user-1',
          phone: '+8801700000000',
          activeRole: role,
          roles: [role],
        ),
      ),
    ];

    FakeApi offerApi() => FakeApi()
      ..on(
        'GET /training/courses',
        FakeResponse.data({
          'items': [
            courseJson(),
            courseJson(
              id: 'done',
              titleEn: 'Already passed',
              certificate: certificateJson(),
            ),
          ],
        }),
      );

    Future<void> openHome(
      WidgetTester tester,
      MemoryTrainingOfferStore store,
      DateTime now, {
      String role = 'WORKER',
    }) => pumpRouted(
      tester,
      api: offerApi(),
      home: const TrainingOfferGate(child: Scaffold(body: Text('home'))),
      offerStore: store,
      now: now,
      overrides: offerOverrides(role: role),
    );

    testWidgets('is shown once, and Later brings it back after 7 days only', (
      tester,
    ) async {
      final store = MemoryTrainingOfferStore();
      final day0 = DateTime.utc(2026, 11, 11, 9);

      await openHome(tester, store, day0);
      expect(find.text('Optional training for your work'), findsOneWidget);
      expect(find.text('Safe home cleaning'), findsOneWidget);
      expect(find.text('Already passed'), findsNothing);
      expect(find.text('about 40 MB data'), findsOneWidget);
      expect(find.text('I’m experienced — take the test'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('offer-later')));
      await tester.pumpAndSettle();
      expect(store.read('user-1').lastAction, TrainingOfferAction.later);

      await openHome(tester, store, day0.add(const Duration(days: 3)));
      expect(find.text('Optional training for your work'), findsNothing);

      await openHome(tester, store, day0.add(const Duration(days: 7)));
      expect(find.text('Optional training for your work'), findsOneWidget);
      await tester.tap(find.text('Start now'));
      await tester.pumpAndSettle();
      expect(store.read('user-1').timesShown, 2);

      await openHome(tester, store, day0.add(const Duration(days: 30)));
      expect(find.text('Optional training for your work'), findsNothing);
    });

    testWidgets('the experienced button opens the test', (tester) async {
      final store = MemoryTrainingOfferStore();
      final api = offerApi()
        ..on(
          'POST /training/courses/course-1/attempts',
          FakeResponse.data(attemptJson(), status: 201),
        );
      await pumpRouted(
        tester,
        api: api,
        home: const TrainingOfferGate(child: Scaffold(body: Text('home'))),
        offerStore: store,
        overrides: offerOverrides(),
      );
      await tester.tap(find.text('I’m experienced — take the test'));
      await tester.pumpAndSettle();

      expect(find.text('Knowledge test'), findsOneWidget);
      expect(store.read('user-1').lastAction, TrainingOfferAction.accepted);
    });

    testWidgets(
      'existing workers who skipped onboarding on this phone still get it',
      (tester) async {
        // Signing in to an existing account goes straight to home, so the
        // local onboarding draft is incomplete and may even say customer.
        // The server role decides.
        final store = MemoryTrainingOfferStore();
        await pumpRouted(
          tester,
          api: offerApi(),
          home: const TrainingOfferGate(child: Scaffold(body: Text('home'))),
          offerStore: store,
          now: DateTime.utc(2026, 11, 11, 9),
          overrides: [
            ...offerOverrides(),
            onboardingControllerProvider.overrideWith(
              (ref) => onboardingFor(KaajRole.customer, complete: false),
            ),
          ],
        );

        expect(find.text('Optional training for your work'), findsOneWidget);
        expect(store.read('user-1').timesShown, 1);
      },
    );

    testWidgets('customers never see it', (tester) async {
      final store = MemoryTrainingOfferStore();
      await openHome(
        tester,
        store,
        DateTime.utc(2026, 11, 11),
        role: 'CUSTOMER',
      );

      expect(find.text('Optional training for your work'), findsNothing);
      expect(store.read('user-1').timesShown, 0);
    });
  });

  group('home', () {
    FakeApi? homeApiInUse;
    FakeApi homeApi() => FakeApi()
      ..on(
        'GET /training/courses',
        FakeResponse.data({
          'items': [courseJson()],
        }),
      )
      ..on(
        'GET /me/certificates',
        FakeResponse.data({
          'items': [certificateJson()],
        }),
      )
      ..on(
        'GET /profiles/me',
        FakeResponse.data({
          'displayName': 'Rahim',
          'activeRole': 'WORKER',
          'completeness': {
            'percent': 65,
            'missing': ['PHOTO', 'TRAINING'],
          },
        }),
      );

    testWidgets('workers see training and completeness cards', (tester) async {
      homeApiInUse = homeApi();
      await pumpRouted(
        tester,
        api: homeApiInUse!,
        home: const HomeScreen(),
        size: const Size(400, 2400),
        overrides: [
          onboardingControllerProvider.overrideWith(
            (ref) => onboardingFor(KaajRole.worker),
          ),
        ],
      );

      expect(find.text('My training'), findsOneWidget);
      expect(
        find.text('Certificates earned: 1 · Courses for your skills: 1'),
        findsOneWidget,
      );
      expect(find.text('65% complete'), findsOneWidget);
      expect(find.text('Add a profile photo'), findsOneWidget);
      final api = homeApiInUse!;
      await tester.tap(find.byKey(const ValueKey('continue-training')));
      await tester.pumpAndSettle();
      expect(api.called('GET /training/courses/course-1'), hasLength(1));
    });

    testWidgets('customers see no training card', (tester) async {
      await pumpRouted(
        tester,
        api: homeApi(),
        home: const HomeScreen(),
        size: const Size(400, 2400),
        overrides: [
          onboardingControllerProvider.overrideWith(
            (ref) => onboardingFor(KaajRole.customer),
          ),
        ],
      );

      expect(find.text('My training'), findsNothing);
      expect(find.byKey(const ValueKey('profile-completeness')), findsNothing);
    });
  });
}

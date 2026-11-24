import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/widgets/k_error_message.dart';
import 'package:kaaj/features/training/domain/training_models.dart';
import 'package:kaaj/features/training/presentation/screens/lesson_screen.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';
import '../support/training_fixtures.dart';

Map<String, dynamic> _step(String id, String kind, String en, String bn) => {
  'id': id,
  'kind': kind,
  'textEn': en,
  'textBn': bn,
  'image': null,
};

final _steps = [
  _step('s1', 'LEARN', 'How to switch off the mains.', 'মেইন সুইচ বন্ধ করা।'),
  _step('s2', 'STEP', 'Find the main switch.', 'মেইন সুইচ খুঁজুন।'),
  _step('s3', 'STEP', 'Switch it off and test.', 'বন্ধ করে পরীক্ষা করুন।'),
  _step('s4', 'HAZARD', 'Never touch bare wires.', 'খোলা তার কখনো ছোঁবেন না।'),
  _step('s5', 'REMEMBER', 'Test before you touch.', 'ছোঁয়ার আগে পরীক্ষা।'),
];

Map<String, dynamic> _lesson(
  String id,
  int order,
  String title, {
  String state = 'OPEN',
  bool? checkpointPassed = false,
  List<Map<String, dynamic>>? steps,
}) => {
  'id': id,
  'sortOrder': order,
  'titleEn': title,
  'titleBn': title,
  'summaryEn': 'Summary of $title.',
  'summaryBn': '$title সারাংশ।',
  'youtubeVideoId': null,
  'durationS': null,
  'isSafety': true,
  'opened': state != 'OPEN',
  'state': state,
  'checkpoint': checkpointPassed == null
      ? null
      : {'questionCount': 2, 'passed': checkpointPassed},
  'steps': ?steps,
};

Map<String, dynamic> _course({
  bool lockedOrder = true,
  bool testLocked = true,
  List<Map<String, dynamic>>? lessons,
}) => {
  ...courseJson(safety: lockedOrder),
  'lockedOrder': lockedOrder,
  'testLocked': testLocked,
  'checkpointsPassed': 1,
  'checkpointLessons': 3,
  'lessons':
      lessons ??
      [
        _lesson(
          'l1',
          1,
          'Getting ready',
          state: 'DONE',
          checkpointPassed: true,
          steps: _steps,
        ),
        _lesson('l2', 2, 'Live wires', steps: _steps),
        _lesson('l3', 3, 'Testing', state: 'LOCKED', steps: _steps),
      ],
};

final _checkpoint = {
  'lessonId': 'l2',
  'passed': false,
  'questions': [
    {
      'id': 'q1',
      'promptEn': 'What do you do first?',
      'promptBn': 'প্রথমে কী করবেন?',
      'options': [
        {'id': 'q1a', 'en': 'Switch off the mains', 'bn': 'মেইন বন্ধ'},
        {'id': 'q1b', 'en': 'Touch the wire', 'bn': 'তার ছোঁয়া'},
      ],
    },
    {
      'id': 'q2',
      'promptEn': 'Before touching you…',
      'promptBn': 'ছোঁয়ার আগে…',
      'options': [
        {'id': 'q2a', 'en': 'Test the wire', 'bn': 'তার পরীক্ষা'},
        {'id': 'q2b', 'en': 'Hope for the best', 'bn': 'ভাগ্যের ওপর ছাড়া'},
      ],
    },
  ],
};

Future<FakeApi> _open(
  WidgetTester tester,
  String path, {
  Map<String, dynamic>? course,
  String lang = 'en',
  Size size = const Size(400, 2400),
  double textScale = 1,
}) async {
  final api = FakeApi()
    ..on(
      'GET /training/courses/course-1',
      FakeResponse.data(course ?? _course()),
    )
    ..on('POST /training/lessons/l2/open', const FakeResponse(204))
    ..on('GET /training/lessons/l2/checkpoint', FakeResponse.data(_checkpoint));
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await pumpRouted(
    tester,
    api: api,
    initial: path,
    locale: Locale(lang),
    size: size,
  );
  // Let the "lesson opened" tick and the refresh it starts finish.
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pumpAndSettle();
  return api;
}

void main() {
  group('course page', () {
    testWidgets('locked order: states, reason and a locked test', (
      tester,
    ) async {
      await _open(tester, '/training/courses/course-1');
      expect(find.byKey(const ValueKey('lesson-state-l1')), findsOneWidget);
      expect(find.text('Done'), findsOneWidget);
      expect(find.text('Locked'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('lesson-locked-reason-l3')),
        findsOneWidget,
      );
      expect(find.textContaining('skip'), findsNothing);
      expect(find.textContaining('Lessons open in order'), findsOneWidget);
      expect(find.text('Lessons with questions done: 1 / 3'), findsOneWidget);
      final test = tester.widget<ButtonStyleButton>(
        find.byKey(const ValueKey('take-test')),
      );
      expect(test.onPressed, isNull);
      expect(find.byKey(const ValueKey('test-locked-reason')), findsOneWidget);

      // A locked lesson does not open.
      await tester.tap(find.text('Testing'));
      await tester.pumpAndSettle();
      expect(find.byType(LessonScreen), findsNothing);
    });

    testWidgets('other courses keep the skip-to-test hint (bn)', (
      tester,
    ) async {
      await _open(
        tester,
        '/training/courses/course-1',
        lang: 'bn',
        course: _course(
          lockedOrder: false,
          testLocked: false,
          lessons: [_lesson('l2', 1, 'Live wires', steps: _steps)],
        ),
      );
      expect(find.textContaining('সরাসরি পরীক্ষা দিন'), findsOneWidget);
      final test = tester.widget<ButtonStyleButton>(
        find.byKey(const ValueKey('take-test')),
      );
      expect(test.onPressed, isNotNull);
    });
  });

  group('lesson page', () {
    for (final lang in ['en', 'bn']) {
      testWidgets('step cards in order at 320 px and 200% text ($lang)', (
        tester,
      ) async {
        await _open(
          tester,
          '/training/courses/course-1/lessons/l2',
          lang: lang,
          size: const Size(320, 4000),
          textScale: 2,
        );
        expect(tester.takeException(), isNull);
        for (final id in ['s1', 's2', 's3', 's4', 's5']) {
          expect(find.byKey(ValueKey('step-$id')), findsOneWidget);
        }
        if (lang == 'en') {
          expect(find.text('You will learn'), findsOneWidget);
          expect(find.text('Step 1'), findsOneWidget);
          expect(find.text('Step 2'), findsOneWidget);
          expect(find.text('Hazard'), findsOneWidget);
          expect(find.text('Remember'), findsOneWidget);
        } else {
          expect(find.text('ধাপ ১'), findsOneWidget);
          expect(find.text('বিপদের ঝুঁকি'), findsOneWidget);
        }
        // The hazard is marked by an icon, not colour alone.
        expect(
          find.descendant(
            of: find.byKey(const ValueKey('step-s4')),
            matching: find.byIcon(Icons.warning_amber_rounded),
          ),
          findsOneWidget,
        );
        // Step 1 sits above Step 2.
        expect(
          tester.getTopLeft(find.byKey(const ValueKey('step-s2'))).dy,
          lessThan(tester.getTopLeft(find.byKey(const ValueKey('step-s3'))).dy),
        );
      });
    }

    testWidgets('an older server without steps shows the summary', (
      tester,
    ) async {
      await _open(
        tester,
        '/training/courses/course-1/lessons/l2',
        course: _course(
          lockedOrder: false,
          testLocked: false,
          lessons: [_lesson('l2', 1, 'Live wires', checkpointPassed: null)],
        ),
      );
      expect(find.byKey(const ValueKey('lesson-summary')), findsOneWidget);
      expect(find.text('Summary of Live wires.'), findsOneWidget);
      expect(find.byKey(const ValueKey('checkpoint-intro')), findsNothing);
    });

    testWidgets('a locked lesson hides its steps', (tester) async {
      await _open(tester, '/training/courses/course-1/lessons/l3');
      expect(find.byKey(const ValueKey('lesson-locked')), findsOneWidget);
      expect(find.byKey(const ValueKey('step-s1')), findsNothing);
    });

    testWidgets('a step whose picture fails to load stays a text card', (
      tester,
    ) async {
      final withPicture = [
        {
          ..._step('s2', 'STEP', 'Find the main switch.', 'মেইন সুইচ খুঁজুন।'),
          'image': {
            'url': 'https://img.kaaj.test/broken.webp',
            'cacheKey': 'step-s2-v1',
            'width': 1600,
            'height': 900,
            'altEn': 'A main switch',
            'altBn': 'একটি মেইন সুইচ',
            'expiresAt': '2026-11-25T00:00:00Z',
          },
        },
      ];
      await _open(
        tester,
        '/training/courses/course-1/lessons/l2',
        course: _course(
          lockedOrder: false,
          testLocked: false,
          lessons: [_lesson('l2', 1, 'Live wires', steps: withPicture)],
        ),
      );
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.text('Find the main switch.'), findsOneWidget);
      expect(find.text('Step 1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    test('a picture box keeps the authored shape', () {
      final image = StepImage.maybe({
        'url': 'https://img.kaaj.test/a.webp',
        'cacheKey': 'k',
        'width': 1600,
        'height': 900,
      })!;
      expect(image.aspectRatio, closeTo(16 / 9, 0.001));
      expect(image.cacheKey, 'k');
      expect(StepImage.maybe(null), isNull);
    });
  });

  group('checkpoint', () {
    testWidgets('one question at a time; a wrong answer explains and the '
        'learner tries again until the lesson is done', (tester) async {
      final api = await _open(tester, '/training/courses/course-1/lessons/l2');
      var tries = 0;
      api.onRequest('POST /training/lessons/l2/checkpoint', (request) {
        tries++;
        return tries == 1
            ? FakeResponse.data({
                'passed': false,
                'results': [
                  {
                    'questionId': 'q1',
                    'correct': true,
                    'explanationEn': '',
                    'explanationBn': '',
                  },
                  {
                    'questionId': 'q2',
                    'correct': false,
                    'explanationEn': 'Always test a wire with a tester first.',
                    'explanationBn': 'আগে টেস্টার দিয়ে তার পরীক্ষা করুন।',
                  },
                ],
                'lessonState': 'OPEN',
                'nextLessonId': 'l3',
                'nextLessonState': 'LOCKED',
                'testLocked': true,
              })
            : FakeResponse.data({
                'passed': true,
                'results': [
                  {'questionId': 'q1', 'correct': true},
                  {'questionId': 'q2', 'correct': true},
                ],
                'lessonState': 'DONE',
                'nextLessonId': 'l3',
                'nextLessonState': 'OPEN',
                'testLocked': true,
              });
      });

      await tester.ensureVisible(
        find.byKey(const ValueKey('checkpoint-start')),
      );
      await tester.tap(find.byKey(const ValueKey('checkpoint-start')));
      await tester.pumpAndSettle();
      expect(find.text('What do you do first?'), findsOneWidget);
      expect(find.text('Before touching you…'), findsNothing);

      await tester.tap(find.byKey(const ValueKey('checkpoint-option-q1a')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('checkpoint-next')));
      await tester.pumpAndSettle();
      expect(find.text('Before touching you…'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('checkpoint-option-q2b')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('checkpoint-next')));
      await tester.pumpAndSettle();

      expect(api.called('POST /training/lessons/l2/checkpoint').first.data, {
        'answers': [
          {'questionId': 'q1', 'optionId': 'q1a'},
          {'questionId': 'q2', 'optionId': 'q2b'},
        ],
      });
      // Only the wrong question comes back, with its explanation.
      expect(
        find.byKey(const ValueKey('checkpoint-explanation')),
        findsOneWidget,
      );
      expect(
        find.textContaining('Always test a wire with a tester first.'),
        findsOneWidget,
      );
      expect(find.text('Before touching you…'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('checkpoint-option-q2a')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('checkpoint-next')));
      await tester.pumpAndSettle();
      expect(api.called('POST /training/lessons/l2/checkpoint').last.data, {
        'answers': [
          {'questionId': 'q1', 'optionId': 'q1a'},
          {'questionId': 'q2', 'optionId': 'q2a'},
        ],
      });
      expect(find.byKey(const ValueKey('checkpoint-done')), findsOneWidget);
      expect(find.text('Lesson done'), findsOneWidget);
      expect(find.byKey(const ValueKey('lesson-next')), findsOneWidget);
    });

    testWidgets('after the last lesson the test is offered', (tester) async {
      final api = await _open(
        tester,
        '/training/courses/course-1/lessons/l2',
        course: _course(
          lessons: [_lesson('l2', 1, 'Live wires', steps: _steps)],
        ),
      );
      api.on(
        'POST /training/lessons/l2/checkpoint',
        FakeResponse.data({
          'passed': true,
          'results': [
            {'questionId': 'q1', 'correct': true},
            {'questionId': 'q2', 'correct': true},
          ],
          'lessonState': 'DONE',
          'nextLessonId': null,
          'nextLessonState': null,
          'testLocked': false,
        }),
      );
      await tester.ensureVisible(
        find.byKey(const ValueKey('checkpoint-start')),
      );
      await tester.tap(find.byKey(const ValueKey('checkpoint-start')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('checkpoint-option-q1a')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('checkpoint-next')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('checkpoint-option-q2a')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('checkpoint-next')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('lesson-take-test')), findsOneWidget);
    });

    testWidgets('a done lesson shows its state straight away (bn)', (
      tester,
    ) async {
      await _open(tester, '/training/courses/course-1/lessons/l1', lang: 'bn');
      expect(find.byKey(const ValueKey('checkpoint-done')), findsOneWidget);
      expect(find.text('পাঠ শেষ হয়েছে'), findsOneWidget);
    });

    testWidgets('a refusal is explained', (tester) async {
      final api = await _open(tester, '/training/courses/course-1/lessons/l2');
      api.on(
        'GET /training/lessons/l2/checkpoint',
        FakeResponse.error(409, 'LESSON_LOCKED'),
      );
      await tester.ensureVisible(
        find.byKey(const ValueKey('checkpoint-start')),
      );
      await tester.tap(find.byKey(const ValueKey('checkpoint-start')));
      await tester.pumpAndSettle();
      expect(find.textContaining('still locked'), findsOneWidget);
    });
  });

  test('every new code has copy in both languages', () {
    for (final language in ['en', 'bn']) {
      final l10n = lookupAppLocalizations(Locale(language));
      for (final code in [
        'LESSON_LOCKED',
        'CHECKPOINT_UNAVAILABLE',
        'CHECKPOINT_ANSWERS_INVALID',
        'TEST_LOCKED',
      ]) {
        expect(
          serverCodeMessage(
            l10n,
            Failure(kind: FailureKind.conflict, message: 'x', code: code),
          ),
          isNotNull,
          reason: '$code $language',
        );
      }
    }
  });
}

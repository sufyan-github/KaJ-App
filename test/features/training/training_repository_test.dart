import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/features/training/data/training_repository.dart';
import 'package:kaaj/features/training/domain/training_models.dart';

import '../../support/fake_api.dart';
import '../../support/training_fixtures.dart';

void main() {
  late FakeApi api;
  late TrainingRepository repository;

  setUp(() {
    api = FakeApi();
    repository = TrainingRepository(api.dio());
  });

  test('lists courses for a scope and parses the course summary', () async {
    api.on(
      'GET /training/courses',
      FakeResponse.data({
        'items': [
          courseJson(certificate: certificateJson()),
          courseJson(
            id: 'course-2',
            relevance: 'GENERAL',
            attemptsLeftToday: 0,
            nextAttemptAt: '2026-11-12T08:00:00.000Z',
          ),
        ],
      }),
    );

    final courses = await repository.courses(scope: CourseScope.all);

    expect(api.requests.single.query, {'scope': 'all'});
    final first = courses.first;
    expect(first.titleFor('en'), 'Safe home cleaning');
    expect(first.titleFor('bn'), 'নিরাপদ ঘর পরিষ্কার');
    expect(first.minutes, 20);
    expect(first.estDataMb, 40);
    expect(first.relevance, CourseRelevance.mySkill);
    expect(first.skill?.slug, 'cleaning');
    expect(first.hasCertificate, isTrue);
    expect(first.certificate!.code, 'K7Q2M9XW4P');
    expect(first.certificate!.evidenceLevel, 'KNOWLEDGE_TESTED');
    expect(courses.last.relevance, CourseRelevance.general);
    expect(courses.last.skill, isNull);
    expect(courses.last.limitReachedAt(DateTime.utc(2026, 11, 11)), isTrue);
  });

  test('default course scope is mine', () async {
    api.on('GET /training/courses', FakeResponse.data({'items': []}));
    await repository.courses();
    expect(api.requests.single.query, {'scope': 'mine'});
  });

  test('loads a course with lessons in order', () async {
    api.on(
      'GET /training/courses/course-1',
      FakeResponse.data(courseDetailJson()),
    );

    final detail = await repository.course('course-1');

    expect(detail.lessons.map((lesson) => lesson.id), ['lesson-1', 'lesson-2']);
    expect(detail.lessons.first.youtubeVideoId, 'abcdefghijk');
    expect(detail.lessons.last.hasVideo, isFalse);
    expect(detail.lessons.last.isSafety, isTrue);
    expect(detail.estimatedLessonDataMb(detail.lessons.first), 40);
    expect(detail.estimatedLessonDataMb(detail.lessons.last), 0);
  });

  test('opening a lesson posts to the lesson and expects no body', () async {
    api.on('POST /training/lessons/lesson-1/open', const FakeResponse(204));

    await repository.openLesson('lesson-1');

    expect(api.requests.single.method, 'POST');
    expect(api.requests.single.path, '/training/lessons/lesson-1/open');
  });

  test('starts an attempt and never expects the answers', () async {
    api.on(
      'POST /training/courses/course-1/attempts',
      FakeResponse.data(attemptJson(), status: 201),
    );

    final attempt = await repository.startAttempt('course-1');

    expect(attempt.attemptId, 'attempt-1');
    expect(attempt.questions, hasLength(2));
    expect(attempt.questions.first.options.map((option) => option.id), [
      'a',
      'b',
    ]);
    expect(attempt.questions.first.promptFor('bn'), 'প্রথমে কী পরবেন?');
  });

  test('submits answers as questionId and optionId pairs', () async {
    api.on(
      'POST /training/attempts/attempt-1/submit',
      FakeResponse.data(resultJson(passed: true)),
    );

    final result = await repository.submitAttempt('attempt-1', {
      'q1': 'a',
      'q2': 'b',
    });

    expect(api.requests.single.data, {
      'answers': [
        {'questionId': 'q1', 'optionId': 'a'},
        {'questionId': 'q2', 'optionId': 'b'},
      ],
    });
    expect(result.passed, isTrue);
    expect(result.scorePct, 100);
    expect(result.results.last.correctOptionId, 'b');
    expect(result.results.last.explanationFor('en'), startsWith('Mixing'));
    expect(result.certificate!.isSafetyCritical, isTrue);
  });

  test('lists my certificates', () async {
    api.on(
      'GET /me/certificates',
      FakeResponse.data({
        'items': [
          certificateJson(),
          certificateJson(id: 'cert-2', status: 'REVOKED'),
        ],
      }),
    );

    final certificates = await repository.myCertificates();

    expect(certificates.first.isValid, isTrue);
    expect(certificates.last.status, CertificateStatus.revoked);
    expect(certificates.first.verifyPath, '/api/v1/certificates/K7Q2M9XW4P');
  });

  test('the attempt limit carries the time the worker may retry', () async {
    api.on(
      'POST /training/courses/course-1/attempts',
      FakeResponse.error(
        409,
        'TRAINING_ATTEMPT_LIMIT',
        details: [
          {'nextAttemptAt': '2026-11-12T08:00:00.000Z'},
        ],
      ),
    );

    await expectLater(
      repository.startAttempt('course-1'),
      throwsA(
        isA<TrainingAttemptLimitFailure>()
            .having((f) => f.kind, 'kind', FailureKind.conflict)
            .having(
              (f) => f.nextAttemptAt,
              'nextAttemptAt',
              DateTime.utc(2026, 11, 12, 8),
            ),
      ),
    );
  });

  test('an existing certificate is reported by its code', () async {
    api.on(
      'POST /training/courses/course-1/attempts',
      FakeResponse.error(409, 'TRAINING_ALREADY_CERTIFIED'),
    );

    await expectLater(
      repository.startAttempt('course-1'),
      throwsA(
        isA<Failure>().having(
          (f) => f.code,
          'code',
          trainingAlreadyCertifiedCode,
        ),
      ),
    );
  });

  test('orders courses for my skills, then general, then other', () {
    final courses = [
      CourseSummary.fromJson(courseJson(id: 'o', relevance: 'OTHER')),
      CourseSummary.fromJson(courseJson(id: 'g1', relevance: 'GENERAL')),
      CourseSummary.fromJson(courseJson(id: 'm', relevance: 'MY_SKILL')),
      CourseSummary.fromJson(courseJson(id: 'g2', relevance: 'GENERAL')),
    ];
    expect(orderCoursesByRelevance(courses).map((course) => course.id), [
      'm',
      'g1',
      'g2',
      'o',
    ]);
  });
}

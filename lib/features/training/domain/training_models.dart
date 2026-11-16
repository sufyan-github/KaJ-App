/// Training data as the API sends it.
///
/// Course, lesson and question copy arrives in both languages (`...En` and
/// `...Bn`). It is authored content, so it is picked by the active language
/// and never routed through the static translation catalog.
library;

String pickLanguage(String languageCode, String en, String bn) {
  if (languageCode == 'en') return en.trim().isNotEmpty ? en : bn;
  return bn.trim().isNotEmpty ? bn : en;
}

String _string(Object? value) => value is String ? value : '';

int _int(Object? value, [int fallback = 0]) => switch (value) {
  final int number => number,
  final num number => number.round(),
  final String text => int.tryParse(text) ?? fallback,
  _ => fallback,
};

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;

List<Map<String, dynamic>> _maps(Object? value) => value is List
    ? value
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false)
    : const [];

class SkillRef {
  const SkillRef({
    required this.id,
    required this.slug,
    required this.nameEn,
    required this.nameBn,
  });

  factory SkillRef.fromJson(Map<String, dynamic> json) => SkillRef(
    id: _string(json['id']),
    slug: _string(json['slug']),
    nameEn: _string(json['nameEn']),
    nameBn: _string(json['nameBn']),
  );

  static SkillRef? maybe(Object? value) =>
      value is Map ? SkillRef.fromJson(Map<String, dynamic>.from(value)) : null;

  final String id;
  final String nameBn;
  final String nameEn;
  final String slug;

  String nameFor(String languageCode) =>
      pickLanguage(languageCode, nameEn, nameBn);
}

enum CertificateStatus { valid, revoked }

class CertificateSummary {
  const CertificateSummary({
    required this.id,
    required this.code,
    required this.courseId,
    required this.courseTitleEn,
    required this.courseTitleBn,
    required this.evidenceLevel,
    required this.scorePct,
    required this.issuedAt,
    required this.status,
    required this.isSafetyCritical,
    required this.verifyPath,
    this.skill,
    this.isPractical = false,
    this.title,
    this.issuedByName,
  });

  factory CertificateSummary.fromJson(Map<String, dynamic> json) =>
      CertificateSummary(
        isPractical: json['kind'] == 'PRACTICAL',
        title: json['title'] as String?,
        issuedByName: switch (json['issuedBy']) {
          final Map issuer => issuer['displayName'] as String?,
          _ => null,
        },
        id: _string(json['id']),
        code: _string(json['code']),
        courseId: _string(json['courseId']),
        courseTitleEn: _string(json['courseTitleEn']),
        courseTitleBn: _string(json['courseTitleBn']),
        skill: SkillRef.maybe(json['skill']),
        evidenceLevel: _string(json['evidenceLevel']),
        scorePct: _int(json['scorePct']),
        issuedAt: _date(json['issuedAt']) ?? DateTime.now(),
        status: json['status'] == 'REVOKED'
            ? CertificateStatus.revoked
            : CertificateStatus.valid,
        isSafetyCritical: json['isSafetyCritical'] == true,
        verifyPath: _string(json['verifyPath']),
      );

  static CertificateSummary? maybe(Object? value) => value is Map
      ? CertificateSummary.fromJson(Map<String, dynamic>.from(value))
      : null;

  final String code;
  final String courseId;
  final String courseTitleBn;
  final String courseTitleEn;
  final String evidenceLevel;
  final String id;
  final bool isSafetyCritical;
  final DateTime issuedAt;
  final int scorePct;
  final SkillRef? skill;
  final CertificateStatus status;
  final String verifyPath;

  bool get isValid => status == CertificateStatus.valid;

  /// A practical certificate a mentor issued after real sessions, as
  /// opposed to a passed knowledge test (QUIZ).
  final bool isPractical;

  /// The learning title for practical certificates.
  final String? title;

  /// The mentor who issued a practical certificate.
  final String? issuedByName;

  String titleFor(String languageCode) {
    final own = title?.trim() ?? '';
    if (own.isNotEmpty) return own;
    return pickLanguage(languageCode, courseTitleEn, courseTitleBn);
  }
}

enum CourseRelevance { mySkill, general, other }

CourseRelevance _relevance(Object? value) => switch (value) {
  'MY_SKILL' => CourseRelevance.mySkill,
  'GENERAL' => CourseRelevance.general,
  _ => CourseRelevance.other,
};

class CourseSummary {
  const CourseSummary({
    required this.id,
    required this.slug,
    required this.titleEn,
    required this.titleBn,
    required this.summaryEn,
    required this.summaryBn,
    required this.minutes,
    required this.estDataMb,
    required this.lessonCount,
    required this.passMarkPct,
    required this.questionCount,
    required this.isSafetyCritical,
    required this.relevance,
    required this.lessonsOpened,
    required this.attemptsLeftToday,
    this.skill,
    this.certificate,
    this.nextAttemptAt,
  });

  factory CourseSummary.fromJson(Map<String, dynamic> json) {
    final progress = json['progress'] is Map
        ? Map<String, dynamic>.from(json['progress'] as Map)
        : const <String, dynamic>{};
    return CourseSummary(
      id: _string(json['id']),
      slug: _string(json['slug']),
      titleEn: _string(json['titleEn']),
      titleBn: _string(json['titleBn']),
      summaryEn: _string(json['summaryEn']),
      summaryBn: _string(json['summaryBn']),
      skill: SkillRef.maybe(json['skill']),
      minutes: _int(json['minutes']),
      estDataMb: _int(json['estDataMb']),
      lessonCount: _int(json['lessonCount'], _int(progress['lessonCount'])),
      passMarkPct: _int(json['passMarkPct'], 70),
      questionCount: _int(json['questionCount'], 10),
      isSafetyCritical: json['isSafetyCritical'] == true,
      relevance: _relevance(json['relevance']),
      lessonsOpened: _int(progress['lessonsOpened']),
      certificate: CertificateSummary.maybe(json['certificate']),
      attemptsLeftToday: _int(json['attemptsLeftToday'], 3),
      nextAttemptAt: _date(json['nextAttemptAt']),
    );
  }

  final int attemptsLeftToday;
  final CertificateSummary? certificate;
  final int estDataMb;
  final String id;
  final bool isSafetyCritical;
  final int lessonCount;
  final int lessonsOpened;
  final int minutes;
  final DateTime? nextAttemptAt;
  final int passMarkPct;
  final int questionCount;
  final CourseRelevance relevance;
  final SkillRef? skill;
  final String slug;
  final String summaryBn;
  final String summaryEn;
  final String titleBn;
  final String titleEn;

  bool get hasCertificate => certificate?.isValid ?? false;

  /// True only while the daily limit is in force for this viewer.
  bool limitReachedAt(DateTime now) =>
      attemptsLeftToday <= 0 &&
      nextAttemptAt != null &&
      nextAttemptAt!.isAfter(now);

  String titleFor(String languageCode) =>
      pickLanguage(languageCode, titleEn, titleBn);

  String summaryFor(String languageCode) =>
      pickLanguage(languageCode, summaryEn, summaryBn);
}

/// Courses for the worker skills first, then general ones, then the rest.
/// The sort is stable, so the server sort order is kept inside each group.
List<CourseSummary> orderCoursesByRelevance(Iterable<CourseSummary> courses) {
  final indexed = courses.toList(growable: false).asMap().entries.toList()
    ..sort((a, b) {
      final byRelevance = a.value.relevance.index.compareTo(
        b.value.relevance.index,
      );
      return byRelevance != 0 ? byRelevance : a.key.compareTo(b.key);
    });
  return indexed.map((entry) => entry.value).toList(growable: false);
}

class TrainingLesson {
  const TrainingLesson({
    required this.id,
    required this.sortOrder,
    required this.titleEn,
    required this.titleBn,
    required this.summaryEn,
    required this.summaryBn,
    required this.isSafety,
    required this.opened,
    this.youtubeVideoId,
    this.durationS,
  });

  factory TrainingLesson.fromJson(Map<String, dynamic> json) {
    final videoId = _string(json['youtubeVideoId']).trim();
    return TrainingLesson(
      id: _string(json['id']),
      sortOrder: _int(json['sortOrder']),
      titleEn: _string(json['titleEn']),
      titleBn: _string(json['titleBn']),
      summaryEn: _string(json['summaryEn']),
      summaryBn: _string(json['summaryBn']),
      youtubeVideoId: videoId.isEmpty ? null : videoId,
      durationS: json['durationS'] == null ? null : _int(json['durationS']),
      isSafety: json['isSafety'] == true,
      opened: json['opened'] == true,
    );
  }

  final int? durationS;
  final String id;
  final bool isSafety;
  final bool opened;
  final int sortOrder;
  final String summaryBn;
  final String summaryEn;
  final String titleBn;
  final String titleEn;
  final String? youtubeVideoId;

  bool get hasVideo => youtubeVideoId != null;

  String titleFor(String languageCode) =>
      pickLanguage(languageCode, titleEn, titleBn);

  String notesFor(String languageCode) =>
      pickLanguage(languageCode, summaryEn, summaryBn);

  TrainingLesson markOpened() => TrainingLesson(
    id: id,
    sortOrder: sortOrder,
    titleEn: titleEn,
    titleBn: titleBn,
    summaryEn: summaryEn,
    summaryBn: summaryBn,
    youtubeVideoId: youtubeVideoId,
    durationS: durationS,
    isSafety: isSafety,
    opened: true,
  );
}

class CourseDetail {
  const CourseDetail({required this.summary, required this.lessons});

  factory CourseDetail.fromJson(Map<String, dynamic> json) {
    final lessons = _maps(json['lessons']).map(TrainingLesson.fromJson).toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return CourseDetail(
      summary: CourseSummary.fromJson(json),
      lessons: List.unmodifiable(lessons),
    );
  }

  final List<TrainingLesson> lessons;
  final CourseSummary summary;

  /// A rough per-lesson share of the course data estimate, in whole MB.
  int estimatedLessonDataMb(TrainingLesson lesson) {
    final videos = lessons.where((item) => item.hasVideo).toList();
    if (!lesson.hasVideo || videos.isEmpty) return 0;
    final total = summary.estDataMb;
    final seconds = videos.fold<int>(
      0,
      (sum, item) => sum + (item.durationS ?? 0),
    );
    final share = seconds > 0 && lesson.durationS != null
        ? total * lesson.durationS! / seconds
        : total / videos.length;
    return share.ceil().clamp(1, total < 1 ? 1 : total);
  }
}

class TestOption {
  const TestOption({required this.id, required this.en, required this.bn});

  factory TestOption.fromJson(Map<String, dynamic> json) => TestOption(
    id: _string(json['id']),
    en: _string(json['en']),
    bn: _string(json['bn']),
  );

  final String bn;
  final String en;
  final String id;

  String textFor(String languageCode) => pickLanguage(languageCode, en, bn);
}

class TestQuestion {
  const TestQuestion({
    required this.id,
    required this.promptEn,
    required this.promptBn,
    required this.options,
  });

  factory TestQuestion.fromJson(Map<String, dynamic> json) => TestQuestion(
    id: _string(json['id']),
    promptEn: _string(json['promptEn']),
    promptBn: _string(json['promptBn']),
    options: _maps(
      json['options'],
    ).map(TestOption.fromJson).toList(growable: false),
  );

  final String id;
  final List<TestOption> options;
  final String promptBn;
  final String promptEn;

  String promptFor(String languageCode) =>
      pickLanguage(languageCode, promptEn, promptBn);
}

class TrainingAttempt {
  const TrainingAttempt({
    required this.attemptId,
    required this.expiresAt,
    required this.questions,
  });

  factory TrainingAttempt.fromJson(Map<String, dynamic> json) =>
      TrainingAttempt(
        attemptId: _string(json['attemptId']),
        expiresAt:
            _date(json['expiresAt']) ??
            DateTime.now().add(const Duration(minutes: 20)),
        questions: _maps(
          json['questions'],
        ).map(TestQuestion.fromJson).toList(growable: false),
      );

  final String attemptId;
  final DateTime expiresAt;
  final List<TestQuestion> questions;
}

class QuestionResult {
  const QuestionResult({
    required this.questionId,
    required this.correct,
    required this.correctOptionId,
    required this.explanationEn,
    required this.explanationBn,
  });

  factory QuestionResult.fromJson(Map<String, dynamic> json) => QuestionResult(
    questionId: _string(json['questionId']),
    correct: json['correct'] == true,
    correctOptionId: _string(json['correctOptionId']),
    explanationEn: _string(json['explanationEn']),
    explanationBn: _string(json['explanationBn']),
  );

  final bool correct;
  final String correctOptionId;
  final String explanationBn;
  final String explanationEn;
  final String questionId;

  String explanationFor(String languageCode) =>
      pickLanguage(languageCode, explanationEn, explanationBn);
}

class TestResult {
  const TestResult({
    required this.scorePct,
    required this.passed,
    required this.passMarkPct,
    required this.results,
    this.certificate,
  });

  factory TestResult.fromJson(Map<String, dynamic> json) => TestResult(
    scorePct: _int(json['scorePct']),
    passed: json['passed'] == true,
    passMarkPct: _int(json['passMarkPct'], 70),
    results: _maps(
      json['results'],
    ).map(QuestionResult.fromJson).toList(growable: false),
    certificate: CertificateSummary.maybe(json['certificate']),
  );

  final CertificateSummary? certificate;
  final int passMarkPct;
  final bool passed;
  final List<QuestionResult> results;
  final int scorePct;
}

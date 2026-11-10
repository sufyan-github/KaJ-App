Map<String, dynamic> skillJson({String id = 'skill-1'}) => {
  'id': id,
  'slug': 'cleaning',
  'nameEn': 'Cleaning',
  'nameBn': 'পরিষ্কার',
};

Map<String, dynamic> certificateJson({
  String id = 'cert-1',
  String courseId = 'course-1',
  bool safety = false,
  String status = 'VALID',
}) => {
  'id': id,
  'code': 'K7Q2M9XW4P',
  'courseId': courseId,
  'courseTitleEn': 'Safe home cleaning',
  'courseTitleBn': 'নিরাপদ ঘর পরিষ্কার',
  'skill': skillJson(),
  'evidenceLevel': 'KNOWLEDGE_TESTED',
  'scorePct': 80,
  'issuedAt': '2026-11-10T08:00:00.000Z',
  'status': status,
  'isSafetyCritical': safety,
  'verifyPath': '/api/v1/certificates/K7Q2M9XW4P',
};

Map<String, dynamic> courseJson({
  String id = 'course-1',
  String titleEn = 'Safe home cleaning',
  String titleBn = 'নিরাপদ ঘর পরিষ্কার',
  String relevance = 'MY_SKILL',
  bool safety = false,
  Map<String, dynamic>? certificate,
  int attemptsLeftToday = 3,
  String? nextAttemptAt,
}) => {
  'id': id,
  'slug': id,
  'titleEn': titleEn,
  'titleBn': titleBn,
  'summaryEn': 'Clean homes safely.',
  'summaryBn': 'নিরাপদে ঘর পরিষ্কার করুন।',
  'skill': relevance == 'GENERAL' ? null : skillJson(),
  'minutes': 20,
  'estDataMb': 40,
  'lessonCount': 2,
  'passMarkPct': 70,
  'questionCount': 2,
  'isSafetyCritical': safety,
  'relevance': relevance,
  'progress': {'lessonsOpened': 0, 'lessonCount': 2},
  'certificate': certificate,
  'attemptsLeftToday': attemptsLeftToday,
  'nextAttemptAt': nextAttemptAt,
};

Map<String, dynamic> courseDetailJson({
  bool safety = false,
  Map<String, dynamic>? certificate,
}) => {
  ...courseJson(safety: safety, certificate: certificate),
  'lessons': [
    {
      'id': 'lesson-2',
      'sortOrder': 2,
      'titleEn': 'Chemicals',
      'titleBn': 'রাসায়নিক',
      'summaryEn': 'Never mix bleach and acid cleaners.',
      'summaryBn': 'ব্লিচ ও অ্যাসিড ক্লিনার কখনো মেশাবেন না।',
      'youtubeVideoId': null,
      'durationS': null,
      'isSafety': true,
      'opened': false,
    },
    {
      'id': 'lesson-1',
      'sortOrder': 1,
      'titleEn': 'Getting ready',
      'titleBn': 'প্রস্তুতি',
      'summaryEn': 'Wear gloves and open the windows.',
      'summaryBn': 'গ্লাভস পরুন ও জানালা খুলে দিন।',
      'youtubeVideoId': 'abcdefghijk',
      'durationS': 300,
      'isSafety': false,
      'opened': false,
    },
  ],
};

Map<String, dynamic> attemptJson() => {
  'attemptId': 'attempt-1',
  'expiresAt': '2026-11-11T06:20:00.000Z',
  'questions': [
    {
      'id': 'q1',
      'promptEn': 'What do you wear first?',
      'promptBn': 'প্রথমে কী পরবেন?',
      'options': [
        {'id': 'a', 'en': 'Gloves', 'bn': 'গ্লাভস'},
        {'id': 'b', 'en': 'Sandals', 'bn': 'স্যান্ডেল'},
      ],
    },
    {
      'id': 'q2',
      'promptEn': 'Can you mix bleach and acid?',
      'promptBn': 'ব্লিচ ও অ্যাসিড মেশানো যায়?',
      'options': [
        {'id': 'a', 'en': 'Yes', 'bn': 'হ্যাঁ'},
        {'id': 'b', 'en': 'Never', 'bn': 'কখনো না'},
      ],
    },
  ],
};

Map<String, dynamic> resultJson({required bool passed}) => {
  'scorePct': passed ? 100 : 50,
  'passed': passed,
  'passMarkPct': 70,
  'results': [
    {
      'questionId': 'q1',
      'correct': true,
      'correctOptionId': 'a',
      'explanationEn': 'Gloves protect your skin.',
      'explanationBn': 'গ্লাভস ত্বক রক্ষা করে।',
    },
    {
      'questionId': 'q2',
      'correct': passed,
      'correctOptionId': 'b',
      'explanationEn': 'Mixing them releases toxic gas.',
      'explanationBn': 'মেশালে বিষাক্ত গ্যাস তৈরি হয়।',
    },
  ],
  'certificate': passed ? certificateJson(safety: true) : null,
};

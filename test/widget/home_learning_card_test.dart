import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/profile/domain/me.dart';
import 'package:kaaj/features/profile/domain/my_profile.dart';
import 'package:kaaj/features/profile/presentation/controllers/me_provider.dart';
import 'package:kaaj/features/training/presentation/widgets/my_training_card.dart';

import '../support/fake_api.dart';
import '../support/pump_app.dart';

Map<String, dynamic> _opportunity(String id, String title, String skillId) => {
  'id': id,
  'opportunityType': 'TRAINING',
  'title': title,
  'description': 'Practical sessions with a mentor.',
  'status': 'APPLICATIONS_OPEN',
  'participantTerms': 'FREE',
  'workArrangement': 'ON_SITE',
  'skills': [
    {'id': skillId, 'name_en': 'Skill', 'name_bn': 'দক্ষতা'},
  ],
};

Me _meWith(List<String> skillIds) => Me(
  userId: 'u1',
  phone: '+8801812345678',
  roles: const ['WORKER'],
  activeRole: 'WORKER',
  displayName: 'Rahim',
  skills: [
    for (final id in skillIds)
      MySkill(
        skillId: id,
        slug: id,
        nameEn: id,
        nameBn: id,
        level: 'BEGINNER',
        hasPriorTraining: false,
      ),
  ],
);

FakeApi _api() => FakeApi()
  ..on('GET /training/courses', FakeResponse.data({'items': <Object>[]}))
  ..on('GET /me/certificates', FakeResponse.data({'items': <Object>[]}))
  ..on(
    'GET /learning-opportunities',
    FakeResponse.data({
      'items': [
        _opportunity('o1', 'Wiring with a mentor', 'skill-wiring'),
        _opportunity('o2', 'Cooking class', 'skill-cooking'),
      ],
    }),
  );

void main() {
  testWidgets('shows learning with a mentor in my skills', (tester) async {
    final api = _api();
    await pumpRouted(
      tester,
      api: api,
      home: const Scaffold(
        body: SingleChildScrollView(child: MyTrainingCard()),
      ),
      size: const Size(400, 2000),
      overrides: [
        meProvider.overrideWith((ref) async => _meWith(['skill-wiring'])),
      ],
    );
    expect(find.text('Learn with a mentor in your skills'), findsOneWidget);
    expect(find.text('Wiring with a mentor'), findsOneWidget);
    expect(find.text('Cooking class'), findsNothing);
    expect(api.called('GET /learning-opportunities').single.query, {
      'skillId': 'skill-wiring',
    });
    await tester.tap(find.byKey(const ValueKey('training-card-explore-learn')));
    await tester.pumpAndSettle();
    expect(find.text('route:/explore?section=learn'), findsOneWidget);
  });

  testWidgets('no skills, no mentor section (bn)', (tester) async {
    final api = _api();
    await pumpRouted(
      tester,
      api: api,
      home: const Scaffold(
        body: SingleChildScrollView(child: MyTrainingCard()),
      ),
      locale: const Locale('bn'),
      overrides: [meProvider.overrideWith((ref) async => _meWith([]))],
    );
    expect(find.text('আপনার দক্ষতায় মেন্টরের সাথে শেখা'), findsNothing);
    expect(api.called('GET /learning-opportunities'), isEmpty);
  });
}

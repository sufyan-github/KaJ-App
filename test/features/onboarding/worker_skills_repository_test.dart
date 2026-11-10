import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/features/onboarding/data/onboarding_repository.dart';
import 'package:kaaj/features/onboarding/domain/worker_skill_input.dart';

import '../../support/fake_api.dart';

void main() {
  late Directory directory;
  late Box<dynamic> box;

  setUpAll(() async {
    directory = await Directory.systemTemp.createTemp('kaaj_skills_');
    Hive.init(directory.path);
    box = await Hive.openBox<dynamic>('skills_test');
  });
  tearDownAll(() async {
    await box.close();
    await directory.delete(recursive: true);
  });

  test('preloads saved skills including decimal years', () async {
    final api = FakeApi()
      ..on(
        'GET /profiles/me/skills',
        FakeResponse.data([
          {
            'skillId': 'skill-1',
            'slug': 'cleaning',
            'nameEn': 'Cleaning',
            'nameBn': 'পরিষ্কার',
            'level': 'ADVANCED',
            'years': '4.5',
            'isVerified': false,
            'hasPriorTraining': true,
          },
        ]),
      );

    final skills = await OnboardingRepository(api.dio(), box).getWorkerSkills();

    expect(
      skills.single,
      const WorkerSkillInput(
        skillId: 'skill-1',
        level: 'ADVANCED',
        years: 4.5,
        hasPriorTraining: true,
      ),
    );
    expect(skills.single.experience, SkillExperience.expert);
  });

  test(
    'saves level, years and prior training, and leaves the rate alone',
    () async {
      final api = FakeApi()
        ..on('PUT /profiles/me/skills', FakeResponse.data([]));

      await OnboardingRepository(api.dio(), box).updateWorkerSkills([
        WorkerSkillInput.fromExperience('skill-1', SkillExperience.aLittle),
        WorkerSkillInput.fromExperience(
          'skill-2',
          SkillExperience.expert,
          hasPriorTraining: true,
        ),
      ]);

      expect(api.requests.map((request) => request.path), [
        '/profiles/me/skills',
      ]);
      expect(api.requests.single.data, {
        'skills': [
          {
            'skillId': 'skill-1',
            'level': 'BEGINNER',
            'years': 0.5,
            'hasPriorTraining': false,
          },
          {
            'skillId': 'skill-2',
            'level': 'EXPERT',
            'years': 5.0,
            'hasPriorTraining': true,
          },
        ],
      });
    },
  );

  test('experience answers map to level and years', () {
    expect(SkillExperience.values.map((item) => (item.level, item.years)), [
      ('BEGINNER', 0.0),
      ('BEGINNER', 0.5),
      ('INTERMEDIATE', 2.0),
      ('EXPERT', 5.0),
    ]);
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/profile/data/my_profile_repository.dart';
import 'package:kaaj/features/profile/domain/my_profile.dart';

import '../../support/fake_api.dart';
import '../../support/training_fixtures.dart';

Map<String, dynamic> myProfileJson({
  int percent = 50,
  List<String> missing = const ['PHOTO', 'BIO', 'TRAINING'],
}) => {
  'displayName': 'Rahim',
  'bio': '',
  'gender': null,
  'birthYear': 1995,
  'primaryLocation': {
    'id': 'loc-1',
    'nameEn': 'Boalia',
    'nameBn': 'বোয়ালিয়া',
  },
  'photoUrl': null,
  'trustLevel': 'IDENTITY',
  'roles': ['CUSTOMER', 'WORKER'],
  'activeRole': 'WORKER',
  'skills': [
    {
      'skillId': 'skill-1',
      'slug': 'cleaning',
      'nameEn': 'Cleaning',
      'nameBn': 'পরিষ্কার',
      'level': 'INTERMEDIATE',
      'years': '2',
      'hasPriorTraining': true,
    },
  ],
  'certificates': [certificateJson()],
  'completeness': {'percent': percent, 'missing': missing},
};

void main() {
  test('reads my profile with completeness and certificates', () async {
    final api = FakeApi()
      ..on('GET /profiles/me', FakeResponse.data(myProfileJson()));

    final profile = await MyProfileRepository(api.dio()).me();

    expect(profile.displayName, 'Rahim');
    expect(profile.primaryLocation!.nameFor('en'), 'Boalia');
    expect(profile.isWorker, isTrue);
    expect(profile.skills.single.years, 2);
    expect(profile.skills.single.hasPriorTraining, isTrue);
    expect(profile.certificates.single.code, 'K7Q2M9XW4P');
    expect(profile.completeness.percent, 50);
    expect(profile.completeness.missing, [
      CompletenessItem.photo,
      CompletenessItem.bio,
      CompletenessItem.training,
    ]);
  });

  test('saves the editable fields through PUT /profiles/me', () async {
    final api = FakeApi()..on('PUT /profiles/me', FakeResponse.data({}));

    await MyProfileRepository(api.dio()).update(
      displayName: ' Rahim ',
      bio: ' Cleaner ',
      primaryLocationId: 'loc-2',
    );

    expect(api.requests.single.data, {
      'displayName': 'Rahim',
      'bio': 'Cleaner',
      'primaryLocationId': 'loc-2',
    });
  });
}

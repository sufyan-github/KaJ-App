import '../../training/domain/training_models.dart';

/// Keys the API uses for missing profile pieces.
enum CompletenessItem { photo, bio, area, skills, identity, training, unknown }

CompletenessItem completenessItemFromKey(String key) => switch (key) {
  'PHOTO' => CompletenessItem.photo,
  'BIO' => CompletenessItem.bio,
  'AREA' => CompletenessItem.area,
  'SKILLS' => CompletenessItem.skills,
  'IDENTITY' => CompletenessItem.identity,
  'TRAINING' => CompletenessItem.training,
  _ => CompletenessItem.unknown,
};

class ProfileCompleteness {
  const ProfileCompleteness({required this.percent, required this.missing});

  factory ProfileCompleteness.fromJson(Object? value) {
    if (value is! Map) {
      return const ProfileCompleteness(percent: 0, missing: []);
    }
    final percent = value['percent'];
    final missing = value['missing'];
    return ProfileCompleteness(
      percent: (percent is num ? percent.round() : 0).clamp(0, 100),
      missing: missing is List
          ? missing
                .whereType<String>()
                .map(completenessItemFromKey)
                .where((item) => item != CompletenessItem.unknown)
                .toList(growable: false)
          : const [],
    );
  }

  final List<CompletenessItem> missing;
  final int percent;

  bool get isComplete => percent >= 100 || missing.isEmpty;
}

class ProfileArea {
  const ProfileArea({
    required this.id,
    required this.nameEn,
    required this.nameBn,
  });

  final String id;
  final String nameBn;
  final String nameEn;

  String nameFor(String languageCode) =>
      pickLanguage(languageCode, nameEn, nameBn);
}

class MySkill {
  const MySkill({
    required this.skillId,
    required this.slug,
    required this.nameEn,
    required this.nameBn,
    required this.level,
    required this.hasPriorTraining,
    this.years,
  });

  factory MySkill.fromJson(Map<String, dynamic> json) => MySkill(
    skillId: json['skillId'] as String? ?? '',
    slug: json['slug'] as String? ?? '',
    nameEn: json['nameEn'] as String? ?? '',
    nameBn: json['nameBn'] as String? ?? '',
    level: json['level'] as String? ?? 'BEGINNER',
    years: parseYears(json['years']),
    hasPriorTraining: json['hasPriorTraining'] == true,
  );

  /// The API sends years as a decimal string ("0.5") or a number.
  static double? parseYears(Object? value) => switch (value) {
    final num number => number.toDouble(),
    final String text => double.tryParse(text),
    _ => null,
  };

  final bool hasPriorTraining;
  final String level;
  final String nameBn;
  final String nameEn;
  final String skillId;
  final String slug;
  final double? years;
}

class MyProfile {
  const MyProfile({
    required this.displayName,
    required this.bio,
    required this.trustLevel,
    required this.roles,
    required this.activeRole,
    required this.skills,
    required this.certificates,
    required this.completeness,
    this.gender,
    this.birthYear,
    this.primaryLocation,
    this.photoUrl,
  });

  factory MyProfile.fromJson(Map<String, dynamic> json) {
    final location = json['primaryLocation'];
    final photo = json['photoUrl'];
    return MyProfile(
      displayName: json['displayName'] as String? ?? '',
      bio: json['bio'] as String? ?? '',
      gender: json['gender'] as String?,
      birthYear: (json['birthYear'] as num?)?.toInt(),
      primaryLocation: location is Map
          ? ProfileArea(
              id: location['id'] as String? ?? '',
              nameEn: location['nameEn'] as String? ?? '',
              nameBn: location['nameBn'] as String? ?? '',
            )
          : null,
      photoUrl: photo is String && photo.trim().isNotEmpty ? photo : null,
      trustLevel: json['trustLevel'] as String? ?? 'NONE',
      roles:
          (json['roles'] as List?)?.whereType<String>().toList(
            growable: false,
          ) ??
          const [],
      activeRole: json['activeRole'] as String? ?? 'CUSTOMER',
      skills:
          (json['skills'] as List?)
              ?.whereType<Map>()
              .map((item) => MySkill.fromJson(Map<String, dynamic>.from(item)))
              .toList(growable: false) ??
          const [],
      certificates:
          (json['certificates'] as List?)
              ?.whereType<Map>()
              .map(
                (item) => CertificateSummary.fromJson(
                  Map<String, dynamic>.from(item),
                ),
              )
              .toList(growable: false) ??
          const [],
      completeness: ProfileCompleteness.fromJson(json['completeness']),
    );
  }

  final String activeRole;
  final String bio;
  final int? birthYear;
  final List<CertificateSummary> certificates;
  final ProfileCompleteness completeness;
  final String displayName;
  final String? gender;
  final String? photoUrl;
  final ProfileArea? primaryLocation;
  final List<String> roles;
  final List<MySkill> skills;
  final String trustLevel;

  bool get isWorker => activeRole == 'WORKER';
}

/// Genders the API accepts, with their Bangla labels.
const profileGenders = {
  'FEMALE': 'নারী',
  'MALE': 'পুরুষ',
  'NON_BINARY': 'নন-বাইনারি',
  'PREFER_NOT_TO_SAY': 'বলতে চাই না',
};

/// Trust levels that mean identity was verified (NID and selfie).
const identityVerifiedLevels = {'IDENTITY', 'VERIFIED', 'SKILL', 'BUSINESS'};

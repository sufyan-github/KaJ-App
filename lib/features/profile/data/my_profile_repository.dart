import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/my_profile.dart';

class MyProfileRepository {
  const MyProfileRepository(this._dio);

  final Dio _dio;

  Future<MyProfile> me() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/profiles/me');
      final data = response.data?['data'];
      if (data is! Map) throw const FormatException('Missing profile data');
      return MyProfile.fromJson(Map<String, dynamic>.from(data));
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  /// Saves the editable profile fields. The display name is required by the
  /// API on every update, so it is always sent. Gender (FEMALE, MALE,
  /// NON_BINARY, PREFER_NOT_TO_SAY) and birth year are optional and only
  /// sent when set; women-only groups and sessions need FEMALE.
  Future<void> update({
    required String displayName,
    required String bio,
    String? primaryLocationId,
    String? gender,
    int? birthYear,
  }) async {
    try {
      await _dio.put<Map<String, dynamic>>(
        '/profiles/me',
        data: {
          'displayName': displayName.trim(),
          'bio': bio.trim(),
          'primaryLocationId': ?primaryLocationId,
          'gender': ?gender,
          'birthYear': ?birthYear,
        },
      );
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }
}

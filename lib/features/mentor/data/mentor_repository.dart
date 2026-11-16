import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/mentor_models.dart';

/// The mentor capability: apply, see the decision, open or close to
/// learners. Paths follow the backend P1.1 contract (`/me/mentor`).
class MentorRepository {
  const MentorRepository(this._dio);

  final Dio _dio;

  /// The persons mentor state. A server without `/me/mentor` yet answers
  /// 404; the status then comes from the profile and roles instead.
  Future<MentorProfile> mine() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/me/mentor');
      return MentorProfile.fromJson(_data(response.data));
    } on DioException catch (error) {
      if (error.response?.statusCode == 404) return _fromProfile();
      throw ErrorMapper.from(error);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  /// Applies with the skills to teach and 1–5 uploaded evidence documents
  /// (VERIFICATION_DOCUMENT ids). Identity must be verified first.
  Future<MentorProfile> apply({
    required List<String> skillIds,
    required String bio,
    required int? yearsExperience,
    required List<String> documentIds,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/me/mentor/application',
        data: {
          'skills': [
            for (final id in skillIds) {'skillId': id},
          ],
          'bio': bio.trim(),
          'yearsExperience': ?yearsExperience,
          'documentIds': documentIds,
        },
      );
      return _profileOr(response.data, MentorStatus.pending);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<MentorProfile> setAccepting(bool accepting) async {
    try {
      final response = await _dio.put<Map<String, dynamic>>(
        '/me/mentor',
        data: {'accepting': accepting},
      );
      return _profileOr(response.data, MentorStatus.approved);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<MentorProfile> _fromProfile() async {
    final response = await _dio.get<Map<String, dynamic>>('/profiles/me');
    final data = _data(response.data);
    final roles = (data['roles'] as List?)?.whereType<String>() ?? const [];
    final profile = MentorProfile.fromJson(data);
    if (profile.status == MentorStatus.none && roles.contains('MENTOR')) {
      return const MentorProfile(status: MentorStatus.approved);
    }
    return profile;
  }

  MentorProfile _profileOr(
    Map<String, dynamic>? envelope,
    MentorStatus fallback,
  ) {
    final data = envelope?['data'];
    if (data is Map && data.isNotEmpty) {
      final profile = MentorProfile.fromJson(Map<String, dynamic>.from(data));
      if (profile.status != MentorStatus.none) return profile;
    }
    return MentorProfile(status: fallback);
  }

  Map<String, dynamic> _data(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    if (data is Map) return Map<String, dynamic>.from(data);
    throw const FormatException('Missing mentor data');
  }
}

import 'package:dio/dio.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/public_worker_profile.dart';

class PublicProfileRepository {
  const PublicProfileRepository(this._dio);

  final Dio _dio;

  Future<PublicWorkerProfile> getMyPublicWorkerProfile() async {
    try {
      final sessionResponse = await _dio.get<Map<String, dynamic>>(
        '/auth/session',
      );
      final session = _data(sessionResponse.data);
      final user = session['user'];
      if (user is! Map || user['id'] is! String) {
        throw const FormatException('Missing current user id');
      }
      final response = await _dio.get<Map<String, dynamic>>(
        '/users/${user['id']}/public',
      );
      return _parse(_data(response.data));
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<PublicWorkerProfile> getWorkerProfile(String userId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/users/$userId/public',
      );
      return _parse(_data(response.data));
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Future<List<PublicWorkerProfile>> listWorkers() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/users/workers');
      final items = _data(response.data)['items'];
      if (items is! List) throw const FormatException('Missing worker list');
      return items
          .whereType<Map>()
          .map((item) => _parse(Map<String, dynamic>.from(item)))
          .toList(growable: false);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  Map<String, dynamic> _data(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    if (data is Map) return Map<String, dynamic>.from(data);
    throw const FormatException('Missing response data');
  }

  PublicWorkerProfile _parse(Map<String, dynamic> json) {
    final area = json['area'];
    final skills = json['skills'];
    final availability = json['availability'];
    return PublicWorkerProfile(
      id: _string(json, 'id'),
      displayName: _string(json, 'displayName'),
      photoUrl: json['photoUrl'] as String?,
      areaNameBn: area is Map ? area['nameBn'] as String? : null,
      trustLevel: _string(json, 'trustLevel'),
      ratingAverage: _string(json, 'ratingAverage'),
      ratingCount: json['ratingCount'] as int? ?? 0,
      completedJobsCount: json['completedJobsCount'] as int? ?? 0,
      skills: skills is List
          ? skills
                .whereType<Map>()
                .map((item) {
                  final value = Map<String, dynamic>.from(item);
                  return PublicWorkerSkill(
                    id: _string(value, 'id'),
                    nameBn: _string(value, 'nameBn'),
                    level: _string(value, 'level'),
                    isVerified: value['isVerified'] == true,
                  );
                })
                .toList(growable: false)
          : const [],
      availability: availability is List
          ? availability.whereType<String>().toList(growable: false)
          : const [],
    );
  }

  String _string(Map<String, dynamic> json, String key) {
    final value = json[key];
    if (value is String) return value;
    throw FormatException('Missing public profile field: $key');
  }
}

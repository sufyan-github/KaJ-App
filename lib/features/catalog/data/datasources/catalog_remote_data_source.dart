import 'package:dio/dio.dart';

class CatalogRemoteDataSource {
  const CatalogRemoteDataSource(this._dio);

  final Dio _dio;

  Future<List<Map<String, dynamic>>> getCategories() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/categories',
      queryParameters: const {'tree': true},
    );
    return _unwrapList(response.data);
  }

  Future<List<Map<String, dynamic>>> getSkills({
    String? categoryId,
    String? query,
  }) async {
    final queryParameters = <String, dynamic>{
      'categoryId': categoryId,
      'q': query?.trim(),
    }..removeWhere((key, value) => value == null || value == '');
    final response = await _dio.get<Map<String, dynamic>>(
      '/skills',
      queryParameters: queryParameters,
    );
    return _unwrapList(response.data);
  }

  Future<List<Map<String, dynamic>>> getLocations({
    String? parentId,
    String? type,
  }) async {
    final queryParameters = <String, dynamic>{
      'parentId': parentId,
      'type': type,
    }..removeWhere((key, value) => value == null);
    final response = await _dio.get<Map<String, dynamic>>(
      '/locations',
      queryParameters: queryParameters,
    );
    return _unwrapList(response.data);
  }

  List<Map<String, dynamic>> _unwrapList(Map<String, dynamic>? envelope) {
    final data = envelope?['data'];
    if (data is! List) {
      throw const FormatException('The API returned an invalid list envelope.');
    }
    return data
        .map((item) {
          if (item is! Map) {
            throw const FormatException(
              'The API returned an invalid list item.',
            );
          }
          return Map<String, dynamic>.from(item);
        })
        .toList(growable: false);
  }
}

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/catalog/data/datasources/catalog_remote_data_source.dart';
import 'package:kaaj/features/catalog/data/repositories/catalog_repository_impl.dart';
import 'package:kaaj/features/catalog/domain/entities/service_location.dart';

void main() {
  test('parses the confirmed bilingual category tree contract', () async {
    final repository = CatalogRepositoryImpl(
      CatalogRemoteDataSource(
        _dioWithData([
          {
            'id': 'category-id',
            'parentId': null,
            'slug': 'home-services',
            'nameEn': 'Home services',
            'nameBn': 'বাসার সেবা',
            'icon': 'home',
            'sortOrder': 0,
            'children': [
              {
                'id': 'child-id',
                'parentId': 'category-id',
                'slug': 'cleaning',
                'nameEn': 'Cleaning',
                'nameBn': 'পরিষ্কার',
                'icon': null,
                'sortOrder': 0,
                'children': [],
              },
            ],
          },
        ]),
      ),
    );

    final categories = await repository.getCategoryTree();

    expect(categories.single.nameBn, 'বাসার সেবা');
    expect(categories.single.children.single.slug, 'cleaning');
  });

  test('maps confirmed location types and decimal strings', () async {
    final repository = CatalogRepositoryImpl(
      CatalogRemoteDataSource(
        _dioWithData([
          {
            'id': 'location-id',
            'parentId': null,
            'type': 'CITY',
            'nameEn': 'Rajshahi',
            'nameBn': 'রাজশাহী',
            'lat': '24.3745',
            'lng': '88.6042',
            'radiusKm': '12.5',
          },
        ]),
      ),
    );

    final locations = await repository.getLocations(
      type: ServiceLocationType.city,
    );

    expect(locations.single.type, ServiceLocationType.city);
    expect(locations.single.latitude, 24.3745);
    expect(locations.single.radiusKm, 12.5);
  });
}

Dio _dioWithData(List<Map<String, Object?>> data) {
  final dio = Dio();
  dio.httpClientAdapter = _JsonAdapter({'data': data});
  return dio;
}

class _JsonAdapter implements HttpClientAdapter {
  const _JsonAdapter(this.body);

  final Map<String, Object> body;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return ResponseBody.fromString(
      jsonEncode(body),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

import '../../../../core/errors/error_mapper.dart';
import '../../domain/entities/catalog_category.dart';
import '../../domain/entities/catalog_skill.dart';
import '../../domain/entities/service_location.dart';
import '../../domain/repositories/catalog_repository.dart';
import '../cache/catalog_cache.dart';
import '../datasources/catalog_remote_data_source.dart';

class CatalogRepositoryImpl implements CatalogRepository {
  const CatalogRepositoryImpl(this._remote, {this._cache});

  final CatalogCache? _cache;
  final CatalogRemoteDataSource _remote;

  @override
  Future<List<CatalogCategory>> getCategoryTree() async {
    try {
      final cached = await _cache?.read('categories:tree');
      if (cached != null) {
        return cached.map(_categoryFromJson).toList(growable: false);
      }
      final data = await _remote.getCategories();
      await _cache?.write('categories:tree', data);
      return data.map(_categoryFromJson).toList(growable: false);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  @override
  Future<List<CatalogSkill>> getSkills({
    String? categoryId,
    String? query,
  }) async {
    try {
      final key = 'skills:${categoryId ?? 'all'}:${query?.trim() ?? ''}';
      final cached = await _cache?.read(key);
      if (cached != null) {
        return cached.map(_skillFromJson).toList(growable: false);
      }
      final data = await _remote.getSkills(
        categoryId: categoryId,
        query: query,
      );
      await _cache?.write(key, data);
      return data.map(_skillFromJson).toList(growable: false);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  @override
  Future<List<ServiceLocation>> getLocations({
    String? parentId,
    ServiceLocationType? type,
  }) async {
    try {
      final key = 'locations:${parentId ?? 'root'}:${type?.name ?? 'all'}';
      final cached = await _cache?.read(key);
      if (cached != null) {
        return cached.map(_locationFromJson).toList(growable: false);
      }
      final data = await _remote.getLocations(
        parentId: parentId,
        type: type?.name.toUpperCase(),
      );
      await _cache?.write(key, data);
      return data.map(_locationFromJson).toList(growable: false);
    } on Object catch (error) {
      throw ErrorMapper.from(error);
    }
  }

  CatalogCategory _categoryFromJson(Map<String, dynamic> json) {
    final children = json['children'];
    return CatalogCategory(
      id: _requiredString(json, 'id'),
      parentId: json['parentId'] as String?,
      slug: _requiredString(json, 'slug'),
      nameEn: _requiredString(json, 'nameEn'),
      nameBn: _requiredString(json, 'nameBn'),
      icon: json['icon'] as String?,
      sortOrder: json['sortOrder'] as int,
      children: children is List
          ? children
                .map((item) {
                  if (item is! Map) {
                    throw const FormatException('Invalid category');
                  }
                  return _categoryFromJson(Map<String, dynamic>.from(item));
                })
                .toList(growable: false)
          : const [],
    );
  }

  CatalogSkill _skillFromJson(Map<String, dynamic> json) => CatalogSkill(
    id: _requiredString(json, 'id'),
    slug: _requiredString(json, 'slug'),
    nameEn: _requiredString(json, 'nameEn'),
    nameBn: _requiredString(json, 'nameBn'),
    categoryId: _requiredString(json, 'categoryId'),
  );

  ServiceLocation _locationFromJson(Map<String, dynamic> json) {
    final type = switch (_requiredString(json, 'type')) {
      'CITY' => ServiceLocationType.city,
      'THANA' => ServiceLocationType.thana,
      'AREA' => ServiceLocationType.area,
      _ => throw const FormatException('Unknown location type'),
    };
    return ServiceLocation(
      id: _requiredString(json, 'id'),
      parentId: json['parentId'] as String?,
      type: type,
      nameEn: _requiredString(json, 'nameEn'),
      nameBn: _requiredString(json, 'nameBn'),
      latitude: double.tryParse(json['lat'] as String? ?? ''),
      longitude: double.tryParse(json['lng'] as String? ?? ''),
      radiusKm: double.tryParse(json['radiusKm'] as String? ?? ''),
    );
  }

  String _requiredString(Map<String, dynamic> json, String key) {
    final value = json[key];
    if (value is String && value.isNotEmpty) return value;
    throw FormatException('Missing catalog field: $key');
  }
}

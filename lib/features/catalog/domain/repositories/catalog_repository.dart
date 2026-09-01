import '../entities/catalog_category.dart';
import '../entities/catalog_skill.dart';
import '../entities/service_location.dart';

abstract interface class CatalogRepository {
  Future<List<CatalogCategory>> getCategoryTree();

  Future<List<CatalogSkill>> getSkills({String? categoryId, String? query});

  Future<List<ServiceLocation>> getLocations({
    String? parentId,
    ServiceLocationType? type,
  });
}

class CatalogCategory {
  const CatalogCategory({
    required this.id,
    required this.slug,
    required this.nameEn,
    required this.nameBn,
    required this.sortOrder,
    this.parentId,
    this.icon,
    this.children = const [],
  });

  final List<CatalogCategory> children;
  final String? icon;
  final String id;
  final String nameBn;
  final String nameEn;
  final String? parentId;
  final int sortOrder;
  final String slug;
}

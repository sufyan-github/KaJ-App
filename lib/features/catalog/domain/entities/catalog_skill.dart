class CatalogSkill {
  const CatalogSkill({
    required this.id,
    required this.slug,
    required this.nameEn,
    required this.nameBn,
    required this.categoryId,
  });

  final String categoryId;
  final String id;
  final String nameBn;
  final String nameEn;
  final String slug;

  String nameFor(String languageCode) => languageCode == 'en' ? nameEn : nameBn;
}

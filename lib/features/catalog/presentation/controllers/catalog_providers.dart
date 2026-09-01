import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/presentation/controllers/auth_providers.dart';
import '../../data/cache/catalog_cache.dart';
import '../../data/datasources/catalog_remote_data_source.dart';
import '../../data/repositories/catalog_repository_impl.dart';
import '../../domain/entities/catalog_category.dart';
import '../../domain/entities/catalog_skill.dart';
import '../../domain/repositories/catalog_repository.dart';

final catalogRepositoryProvider = Provider<CatalogRepository>((ref) {
  return CatalogRepositoryImpl(
    CatalogRemoteDataSource(ref.watch(dioProvider)),
    cache: const CatalogCache(),
  );
});

final categoryTreeProvider = FutureProvider<List<CatalogCategory>>((ref) {
  return ref.watch(catalogRepositoryProvider).getCategoryTree();
});

final catalogSkillsProvider = FutureProvider<List<CatalogSkill>>((ref) {
  return ref.watch(catalogRepositoryProvider).getSkills();
});

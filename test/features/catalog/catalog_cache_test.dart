import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/features/catalog/data/cache/catalog_cache.dart';

void main() {
  late Directory temporaryDirectory;

  setUp(() async {
    temporaryDirectory = await Directory.systemTemp.createTemp(
      'kaaj-catalog-cache-',
    );
    Hive.init(temporaryDirectory.path);
  });

  tearDown(() async {
    await Hive.close();
    await temporaryDirectory.delete(recursive: true);
  });

  test('persists a schema-versioned catalog across box reopen', () async {
    const cache = CatalogCache();
    await cache.write('categories:tree', [
      {
        'id': 'category-id',
        'slug': 'home-services',
        'nameEn': 'Home services',
        'nameBn': 'বাসার সেবা',
      },
    ]);
    await Hive.close();

    final restored = await cache.read('categories:tree');

    expect(restored?.single['id'], 'category-id');
  });
}

import 'dart:convert';

import 'package:hive_ce_flutter/hive_flutter.dart';

class CatalogCache {
  const CatalogCache();

  static const _boxName = 'catalog.cache.v1';
  static const _schemaVersion = 1;
  static const maxAge = Duration(hours: 1);

  Future<List<Map<String, dynamic>>?> read(String key) async {
    final box = await Hive.openBox<String>(_boxName);
    final encoded = box.get(key);
    if (encoded == null) return null;
    try {
      final envelope = jsonDecode(encoded);
      if (envelope is! Map || envelope['schemaVersion'] != _schemaVersion) {
        await box.delete(key);
        return null;
      }
      final cachedAt = DateTime.tryParse(envelope['cachedAt'] as String? ?? '');
      if (cachedAt == null || DateTime.now().difference(cachedAt) > maxAge) {
        await box.delete(key);
        return null;
      }
      final data = envelope['data'];
      if (data is! List) throw const FormatException('Invalid cached catalog');
      return data
          .map((item) {
            if (item is! Map) {
              throw const FormatException('Invalid cached item');
            }
            return Map<String, dynamic>.from(item);
          })
          .toList(growable: false);
    } on Object {
      await box.delete(key);
      return null;
    }
  }

  Future<void> write(String key, List<Map<String, dynamic>> data) async {
    final box = await Hive.openBox<String>(_boxName);
    await box.put(
      key,
      jsonEncode({
        'schemaVersion': _schemaVersion,
        'cachedAt': DateTime.now().toUtc().toIso8601String(),
        'data': data,
      }),
    );
  }
}

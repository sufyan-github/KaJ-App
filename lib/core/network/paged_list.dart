import 'dart:collection';

/// One page of a server list. It is still a plain [List], so screens and
/// tests that expect a list keep working; [nextCursor] is non-null only
/// when the server says there is more.
class PagedList<E> extends ListBase<E> {
  PagedList(List<E> items, {this.nextCursor})
    : _items = List.unmodifiable(items);

  final List<E> _items;

  /// Pass back as `cursor` to get the next page. Null on the last page, and
  /// always null against a server that does not paginate this list yet.
  final String? nextCursor;

  bool get hasMore => nextCursor != null && nextCursor!.isNotEmpty;

  @override
  int get length => _items.length;

  @override
  set length(int value) => throw UnsupportedError('A page is read-only.');

  @override
  E operator [](int index) => _items[index];

  @override
  void operator []=(int index, E value) =>
      throw UnsupportedError('A page is read-only.');

  /// Reads the cursor wherever the API puts it: `meta.nextCursor`,
  /// `data.nextCursor` or `meta.pagination.nextCursor`.
  static String? cursorFrom(Map<String, dynamic>? envelope) {
    String? text(Object? value) =>
        value is String && value.trim().isNotEmpty ? value : null;
    final meta = envelope?['meta'];
    final data = envelope?['data'];
    return text(meta is Map ? meta['nextCursor'] : null) ??
        text(data is Map ? data['nextCursor'] : null) ??
        text(
          meta is Map && meta['pagination'] is Map
              ? (meta['pagination'] as Map)['nextCursor']
              : null,
        );
  }
}

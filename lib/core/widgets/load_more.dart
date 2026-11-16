import 'package:flutter/material.dart';

import '../network/paged_list.dart';
import '../theme/app_theme.dart';
import 'k_localized_text.dart';

/// Pages fetched after the first one, for a screen whose first page comes
/// from a provider. A new first page (refresh) starts over.
class MorePages<T> {
  Object? _source;
  final _extra = <T>[];
  String? _cursor;
  bool loading = false;
  bool failed = false;

  /// Call with the provider's first page on every build.
  List<T> merge(List<T> first) {
    if (!identical(first, _source)) {
      _source = first;
      _extra.clear();
      _cursor = first is PagedList<T> ? first.nextCursor : null;
      loading = false;
      failed = false;
    }
    return [...first, ..._extra];
  }

  bool get hasMore => _cursor != null && _cursor!.isNotEmpty;

  /// Fetches the next page and calls [changed] around it.
  Future<void> loadNext(
    Future<List<T>> Function(String cursor) fetch,
    VoidCallback changed,
  ) async {
    final cursor = _cursor;
    if (cursor == null || loading) return;
    loading = true;
    failed = false;
    changed();
    try {
      final page = await fetch(cursor);
      _extra.addAll(page);
      _cursor = page is PagedList<T> ? page.nextCursor : null;
    } on Object {
      failed = true;
    } finally {
      loading = false;
      changed();
    }
  }
}

/// The "show more" control at the end of a paginated list.
class LoadMoreButton extends StatelessWidget {
  const LoadMoreButton({
    required this.loading,
    required this.failed,
    required this.onPressed,
    super.key,
  });

  final bool loading;
  final bool failed;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: KSpacing.md),
    child: Center(
      child: loading
          ? const CircularProgressIndicator()
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (failed)
                  const Padding(
                    padding: EdgeInsets.only(bottom: KSpacing.xs),
                    child: KLocalizedText(
                      'আরও লোড করা যায়নি।',
                      style: TextStyle(color: KColors.danger),
                    ),
                  ),
                OutlinedButton.icon(
                  key: const ValueKey('load-more'),
                  onPressed: onPressed,
                  icon: const Icon(Icons.expand_more),
                  label: KLocalizedText(
                    failed ? 'আবার চেষ্টা করুন' : 'আরও দেখুন',
                  ),
                ),
              ],
            ),
    ),
  );
}

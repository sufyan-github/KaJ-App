import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failure_copy.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../domain/entities/service_location.dart';
import '../controllers/catalog_providers.dart';

/// Picks a person's area by walking city → thana → area.
///
/// The API returns one level at a time (`GET /locations?parentId=`), so
/// asking only for the top level offered nothing but the city. A thana can
/// be chosen as a whole when it has no areas, or when the person prefers
/// not to be more precise. A city alone is never offered as an area.
class AreaPicker extends ConsumerStatefulWidget {
  const AreaPicker({
    required this.selectedId,
    required this.onSelected,
    super.key,
  });

  final String? selectedId;
  final ValueChanged<ServiceLocation> onSelected;

  @override
  ConsumerState<AreaPicker> createState() => _AreaPickerState();
}

class _AreaPickerState extends ConsumerState<AreaPicker> {
  final _path = <ServiceLocation>[];
  String _query = '';
  bool _autoEntered = false;

  void _enter(ServiceLocation place) => setState(() {
    _path.add(place);
    _query = '';
  });

  void _backTo(int depth) => setState(() {
    _path.removeRange(depth, _path.length);
    _query = '';
  });

  bool _matches(ServiceLocation item) {
    if (_query.isEmpty) return true;
    return item.nameBn.contains(_query) ||
        item.nameEn.toLowerCase().contains(_query.toLowerCase());
  }

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final parent = _path.isEmpty ? null : _path.last;
    final level = ref.watch(locationChildrenProvider(parent?.id));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: KSpacing.xs,
          runSpacing: KSpacing.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            ActionChip(
              avatar: const Icon(Icons.public, size: 16),
              label: const KLocalizedText('সব শহর'),
              onPressed: _path.isEmpty ? null : () => _backTo(0),
            ),
            for (final (index, place) in _path.indexed)
              ActionChip(
                avatar: const Icon(Icons.chevron_right, size: 16),
                label: Text(place.nameFor(language)),
                onPressed: index == _path.length - 1
                    ? null
                    : () => _backTo(index + 1),
              ),
          ],
        ),
        const SizedBox(height: KSpacing.sm),
        TextField(
          key: ValueKey('area-search-${parent?.id ?? 'root'}'),
          decoration: InputDecoration(
            labelText: KaajLocalizations.text(context, 'এলাকা খুঁজুন'),
            prefixIcon: const Icon(Icons.search),
          ),
          onChanged: (value) => setState(() => _query = value.trim()),
        ),
        const SizedBox(height: KSpacing.sm),
        level.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(KSpacing.lg),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, _) => Column(
            children: [
              Text(
                failureText(context, error, 'এলাকার তালিকা লোড করা যায়নি।'),
              ),
              TextButton(
                onPressed: () =>
                    ref.invalidate(locationChildrenProvider(parent?.id)),
                child: const KLocalizedText('আবার চেষ্টা করুন'),
              ),
            ],
          ),
          data: (items) {
            // Only one city (Rajshahi today): open it straight away.
            if (parent == null &&
                !_autoEntered &&
                items.length == 1 &&
                items.single.type != ServiceLocationType.area) {
              _autoEntered = true;
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted && _path.isEmpty) _enter(items.single);
              });
            }
            final visible = items.where(_matches).toList(growable: false);
            final canPickParent =
                parent != null && parent.type == ServiceLocationType.thana;
            return RadioGroup<String>(
              groupValue: widget.selectedId,
              onChanged: (id) {
                if (id == null) return;
                final picked = id == parent?.id
                    ? parent
                    : items.where((item) => item.id == id).firstOrNull;
                if (picked != null) widget.onSelected(picked);
              },
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (canPickParent)
                    RadioListTile<String>(
                      value: parent.id,
                      title: Text(
                        '${parent.nameFor(language)} '
                        '(${KaajLocalizations.text(context, 'পুরো থানা')})',
                      ),
                    ),
                  if (items.isEmpty && !canPickParent)
                    const Padding(
                      padding: EdgeInsets.all(KSpacing.md),
                      child: KLocalizedText('এখানে কোনো এলাকা যোগ করা নেই।'),
                    ),
                  for (final item in visible)
                    if (item.type == ServiceLocationType.area)
                      RadioListTile<String>(
                        value: item.id,
                        title: Text(item.nameFor(language)),
                      )
                    else
                      ListTile(
                        leading: Icon(
                          widget.selectedId == item.id
                              ? Icons.radio_button_checked
                              : Icons.location_city_outlined,
                        ),
                        title: Text(item.nameFor(language)),
                        subtitle: KLocalizedText(
                          item.type == ServiceLocationType.city
                              ? 'থানা দেখুন'
                              : 'এলাকা দেখুন',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _enter(item),
                      ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

/// The picker in a bottom sheet, for forms. Returns the chosen place, or
/// null when dismissed.
Future<ServiceLocation?> showAreaPickerSheet(
  BuildContext context, {
  String? selectedId,
}) => showModalBottomSheet<ServiceLocation>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (sheetContext) => DraggableScrollableSheet(
    expand: false,
    initialChildSize: 0.8,
    maxChildSize: 0.95,
    builder: (context, controller) => ListView(
      controller: controller,
      padding: const EdgeInsets.fromLTRB(
        KSpacing.md,
        0,
        KSpacing.md,
        KSpacing.lg,
      ),
      children: [
        KLocalizedText(
          'আপনার এলাকা বেছে নিন',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: KSpacing.sm),
        AreaPicker(
          selectedId: selectedId,
          onSelected: (place) => Navigator.pop(sheetContext, place),
        ),
      ],
    ),
  ),
);

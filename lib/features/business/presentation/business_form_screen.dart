import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure.dart';
import '../../../core/errors/failure_copy.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../../core/widgets/k_text_field.dart';
import '../../catalog/presentation/widgets/area_picker.dart';
import '../../profile/presentation/controllers/me_provider.dart';
import '../business_routes.dart';
import '../domain/business_models.dart';
import 'business_providers.dart';
import 'business_widgets.dart';

/// Create a business, or edit one ([businessId]) as an owner or manager.
class BusinessFormScreen extends ConsumerWidget {
  const BusinessFormScreen({this.businessId, super.key});

  final String? businessId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = businessId;
    final title = id == null ? 'নতুন ব্যবসা' : 'ব্যবসার তথ্য বদলান';
    if (id == null) {
      return Scaffold(
        appBar: AppBar(title: KLocalizedText(title)),
        body: const _BusinessForm(),
      );
    }
    final business = ref.watch(businessDetailProvider(id));
    return Scaffold(
      appBar: AppBar(title: KLocalizedText(title)),
      body: business.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => BusinessLoadError(
          error: error,
          label: 'ব্যবসার তথ্য লোড করা যায়নি।',
          onRetry: () => ref.invalidate(businessDetailProvider(id)),
        ),
        data: (business) => business.canEdit
            ? _BusinessForm(initial: business)
            : const BusinessLoadError(
                error: Failure(kind: FailureKind.notFound, message: ''),
                label: 'ব্যবসার তথ্য লোড করা যায়নি।',
                onRetry: _noop,
              ),
      ),
    );
  }
}

void _noop() {}

class _BusinessForm extends ConsumerStatefulWidget {
  const _BusinessForm({this.initial});

  final Business? initial;

  @override
  ConsumerState<_BusinessForm> createState() => _BusinessFormState();
}

class _BusinessFormState extends ConsumerState<_BusinessForm> {
  final _form = GlobalKey<FormState>();
  late final Business? _initial = widget.initial;
  late final _name = TextEditingController(text: _initial?.name);
  late final _description = TextEditingController(text: _initial?.description);
  late final _address = TextEditingController(text: _initial?.address);
  late final _contact = TextEditingController(text: _initial?.contactPerson);
  late final _licence = TextEditingController(text: _initial?.tradeLicenceNo);
  late final _employees = TextEditingController(
    text: _initial?.employeesCount?.toString(),
  );
  late BusinessStage _stage = _initial?.stage ?? BusinessStage.informal;
  late String? _categoryId = _initial?.category?.id;
  late String? _areaId = _initial?.area?.id;
  String? _areaName;
  late bool _isPublic = _initial?.isPublic ?? false;
  late bool _seekingPartners = _initial?.seekingPartners ?? false;
  bool _saving = false;
  bool _deleting = false;
  bool _areaFromProfile = false;

  bool get _editing => _initial != null;

  @override
  void dispose() {
    for (final controller in [
      _name,
      _description,
      _address,
      _contact,
      _licence,
      _employees,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _text(TextEditingController controller) {
    final value = controller.text.trim();
    return value.isEmpty ? null : value;
  }

  Map<String, Object?> _fields() {
    final employees = int.tryParse(_employees.text.trim());
    final all = <String, Object?>{
      'name': _name.text.trim(),
      'stage': _stage.wire,
      'description': _text(_description),
      'categoryId': _categoryId,
      'locationId': _areaId,
      'address': _text(_address),
      'contactPerson': _text(_contact),
      'tradeLicenceNo': _stage == BusinessStage.registered
          ? _text(_licence)
          : null,
      'employeesCount': employees,
      'isPublic': _isPublic,
      'seekingPartners': _seekingPartners,
    };
    final initial = _initial;
    if (initial == null) {
      // Create: send only what was filled in.
      return {
        for (final entry in all.entries)
          if (entry.value != null) entry.key: entry.value,
      };
    }
    // Edit: send only what changed (null clears). A changed name or
    // licence number resets an approved verification, so never resend it.
    final before = <String, Object?>{
      'name': initial.name,
      'stage': initial.stage.wire,
      'description': initial.description,
      'categoryId': initial.category?.id,
      'locationId': initial.area?.id,
      'address': initial.address,
      'contactPerson': initial.contactPerson,
      'tradeLicenceNo': initial.tradeLicenceNo,
      'employeesCount': initial.employeesCount,
      'isPublic': initial.isPublic,
      'seekingPartners': initial.seekingPartners,
    };
    final changed = {
      for (final entry in all.entries)
        if (entry.value != before[entry.key]) entry.key: entry.value,
    };
    // Keep the licence number when only the stage moved away from
    // REGISTERED; the server resets verification by itself.
    if (_stage != BusinessStage.registered) changed.remove('tradeLicenceNo');
    return changed;
  }

  Future<void> _save() async {
    if (_saving || !_form.currentState!.validate()) return;
    final fields = _fields();
    if (_editing && fields.isEmpty) {
      context.pop();
      return;
    }
    setState(() => _saving = true);
    final repository = ref.read(businessRepositoryProvider);
    try {
      if (_editing) {
        await repository.update(_initial!.id, fields);
        ref.invalidate(businessDetailProvider(_initial.id));
        ref.invalidate(myBusinessesProvider);
        if (mounted) context.pop();
      } else {
        final created = await repository.create(fields);
        ref.invalidate(myBusinessesProvider);
        if (mounted) {
          context.pushReplacement(BusinessRoutes.detail(created.id));
        }
      }
    } on Object catch (error) {
      if (mounted) {
        showFailureSnack(context, error, 'ব্যবসার তথ্য সংরক্ষণ করা যায়নি।');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    if (_deleting) return;
    final confirmed = await confirmBusinessAction(
      context,
      title: 'ব্যবসাটি মুছে ফেলবেন?',
      message:
          'ব্যবসার প্রোফাইল, পণ্য ও সেবা এবং সদস্যদের তালিকা আর দেখা যাবে না।',
      confirm: 'মুছে ফেলুন',
    );
    if (!confirmed || !mounted) return;
    setState(() => _deleting = true);
    try {
      await ref.read(businessRepositoryProvider).delete(_initial!.id);
      ref.invalidate(myBusinessesProvider);
      if (mounted) context.pop('deleted');
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, 'ব্যবসা মুছে ফেলা যায়নি।');
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  Future<void> _pickArea() async {
    final place = await showAreaPickerSheet(context, selectedId: _areaId);
    if (place == null || !mounted) return;
    final language = Localizations.localeOf(context).languageCode;
    setState(() {
      _areaId = place.id;
      _areaName = place.nameFor(language);
      _areaFromProfile = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    // A new business starts in the area of the person.
    if (!_editing && _areaId == null && !_areaFromProfile) {
      final area = ref.watch(meProvider).valueOrNull?.area;
      if (area != null) {
        _areaId = area.id;
        _areaName = area.nameFor(language);
        _areaFromProfile = true;
      }
    }
    final categories = ref.watch(businessCategoriesProvider);
    final areaLabel = _initial?.area != null && _areaId == _initial!.area!.id
        ? _initial.area!.nameFor(language)
        : _areaName;
    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          KSpacing.md,
          KSpacing.sm,
          KSpacing.md,
          KSpacing.xl,
        ),
        children: [
          KTextField(
            key: const ValueKey('business-name'),
            label: 'ব্যবসার নাম',
            controller: _name,
            textInputAction: TextInputAction.next,
            validator: (value) {
              final length = value?.trim().length ?? 0;
              if (length < 2) return 'কমপক্ষে ২ অক্ষরের নাম লিখুন';
              if (length > 120) return 'নাম ১২০ অক্ষরের বেশি হতে পারবে না';
              return null;
            },
          ),
          const SizedBox(height: KSpacing.md),
          KLocalizedText(
            'ব্যবসার পর্যায়',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: KSpacing.xs),
          SegmentedButton<BusinessStage>(
            showSelectedIcon: false,
            segments: [
              for (final stage in BusinessStage.values)
                ButtonSegment(
                  value: stage,
                  label: KLocalizedText(
                    businessStageLabel(stage),
                    key: ValueKey('business-stage-${stage.wire}'),
                    textAlign: TextAlign.center,
                  ),
                ),
            ],
            selected: {_stage},
            onSelectionChanged: (value) => setState(() => _stage = value.first),
          ),
          if (_stage == BusinessStage.registered) ...[
            const SizedBox(height: KSpacing.md),
            KTextField(
              key: const ValueKey('business-licence'),
              label: 'ট্রেড লাইসেন্স নম্বর',
              controller: _licence,
              helperText: 'যাচাইয়ের জন্য প্রয়োজন',
              validator: (value) => (value?.trim().length ?? 0) > 60
                  ? 'লাইসেন্স নম্বর ৬০ অক্ষরের বেশি হতে পারবে না'
                  : null,
            ),
          ],
          const SizedBox(height: KSpacing.md),
          KTextField(
            key: const ValueKey('business-description'),
            label: 'ব্যবসার বিবরণ',
            controller: _description,
            minLines: 3,
            maxLines: 6,
            textInputAction: TextInputAction.newline,
            validator: (value) => (value?.trim().length ?? 0) > 2000
                ? 'বিবরণ ২০০০ অক্ষরের বেশি হতে পারবে না'
                : null,
          ),
          const SizedBox(height: KSpacing.md),
          categories.when(
            loading: () => const LinearProgressIndicator(),
            error: (error, _) => Row(
              children: [
                Expanded(
                  child: Text(
                    failureText(context, error, 'খাতের তালিকা লোড করা যায়নি।'),
                  ),
                ),
                TextButton(
                  onPressed: () => ref.invalidate(businessCategoriesProvider),
                  child: const KLocalizedText('আবার চেষ্টা করুন'),
                ),
              ],
            ),
            data: (items) => DropdownButtonFormField<String>(
              key: const ValueKey('business-sector'),
              initialValue: items.any((item) => item.id == _categoryId)
                  ? _categoryId
                  : null,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: KaajLocalizations.text(context, 'ব্যবসার খাত'),
              ),
              items: [
                for (final item in items)
                  DropdownMenuItem(
                    value: item.id,
                    child: Text(_sectorName(items, item, language)),
                  ),
              ],
              onChanged: (value) => setState(() => _categoryId = value),
            ),
          ),
          const SizedBox(height: KSpacing.md),
          Card(
            margin: EdgeInsets.zero,
            child: ListTile(
              key: const ValueKey('business-area'),
              leading: const Icon(Icons.place_outlined),
              title: const KLocalizedText('এলাকা'),
              subtitle: areaLabel == null
                  ? const KLocalizedText('এলাকা বেছে নিন')
                  : Text(areaLabel),
              trailing: const Icon(Icons.chevron_right),
              onTap: _pickArea,
            ),
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            label: 'ঠিকানা',
            controller: _address,
            validator: (value) => (value?.trim().length ?? 0) > 300
                ? 'ঠিকানা ৩০০ অক্ষরের বেশি হতে পারবে না'
                : null,
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            label: 'যোগাযোগের ব্যক্তি',
            controller: _contact,
            validator: (value) => (value?.trim().length ?? 0) > 120
                ? 'নাম ১২০ অক্ষরের বেশি হতে পারবে না'
                : null,
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            key: const ValueKey('business-employees'),
            label: 'কর্মীর সংখ্যা',
            controller: _employees,
            keyboardType: TextInputType.number,
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.isEmpty) return null;
              final count = int.tryParse(text);
              return count == null || count < 0 || count > 100000
                  ? 'সঠিক সংখ্যা লিখুন'
                  : null;
            },
          ),
          const SizedBox(height: KSpacing.sm),
          SwitchListTile(
            key: const ValueKey('business-public'),
            contentPadding: EdgeInsets.zero,
            value: _isPublic,
            onChanged: (value) => setState(() => _isPublic = value),
            title: const KLocalizedText('সবাই দেখতে পাবে'),
            subtitle: const KLocalizedText(
              'প্রকাশ করতে খাত ও এলাকা দিতে হবে। ব্যক্তিগত ব্যবসা শুধু সদস্যরা দেখেন।',
            ),
          ),
          SwitchListTile(
            key: const ValueKey('business-seeking'),
            contentPadding: EdgeInsets.zero,
            value: _seekingPartners,
            onChanged: (value) => setState(() => _seekingPartners = value),
            title: const KLocalizedText('অংশীদার খুঁজছি'),
            subtitle: const KLocalizedText(
              'প্রকাশিত হলে অংশীদার তালিকায় দেখা যাবে।',
            ),
          ),
          const SizedBox(height: KSpacing.lg),
          KPrimaryButton(
            key: const ValueKey('business-save'),
            label: _editing ? 'সংরক্ষণ করুন' : 'ব্যবসা তৈরি করুন',
            isLoading: _saving,
            onPressed: _saving || _deleting ? null : _save,
          ),
          if (_editing && _initial!.isOwner) ...[
            const SizedBox(height: KSpacing.md),
            OutlinedButton.icon(
              key: const ValueKey('business-delete'),
              style: OutlinedButton.styleFrom(foregroundColor: KColors.danger),
              onPressed: _saving || _deleting ? null : _delete,
              icon: const Icon(Icons.delete_outline),
              label: const KLocalizedText('ব্যবসা মুছে ফেলুন'),
            ),
          ],
        ],
      ),
    );
  }

  String _sectorName(List<BusinessRef> all, BusinessRef item, String language) {
    final parent = item.parentId == null
        ? null
        : all.where((other) => other.id == item.parentId).firstOrNull;
    final name = item.nameFor(language);
    return parent == null ? name : '${parent.nameFor(language)} › $name';
  }
}

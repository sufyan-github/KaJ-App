import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/formatting/kaaj_format.dart';
import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_empty_state.dart';
import '../../../../core/widgets/k_error_state.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../catalog/domain/entities/catalog_category.dart';
import '../../../catalog/domain/entities/service_location.dart';
import '../../../catalog/presentation/controllers/catalog_providers.dart';
import '../../domain/job_alert_errors.dart';
import '../../domain/job_models.dart';
import '../controllers/jobs_providers.dart';

class JobAlertsScreen extends ConsumerStatefulWidget {
  const JobAlertsScreen({super.key});

  @override
  ConsumerState<JobAlertsScreen> createState() => _JobAlertsScreenState();
}

class _JobAlertsScreenState extends ConsumerState<JobAlertsScreen> {
  final Set<String> _deleting = {};

  Future<void> _delete(JobAlert alert) async {
    setState(() => _deleting.add(alert.id));
    try {
      await ref.read(jobsRepositoryProvider).deleteJobAlert(alert.id);
      ref.invalidate(jobAlertsProvider);
      if (mounted) _snack('কাজের সতর্কতা মুছে ফেলা হয়েছে।');
    } on Object {
      if (mounted) _snack('সতর্কতা মুছে ফেলা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      if (mounted) setState(() => _deleting.remove(alert.id));
    }
  }

  Future<void> _add() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _NewAlertSheet(),
    );
    if (created == true) {
      ref.invalidate(jobAlertsProvider);
      if (mounted) {
        _snack('কাজের সতর্কতা চালু হয়েছে। মিলে গেলে নোটিফিকেশন পাবেন।');
      }
    }
  }

  void _snack(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: KLocalizedText(message)));

  @override
  Widget build(BuildContext context) {
    final alerts = ref.watch(jobAlertsProvider);
    final language = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('কাজের সতর্কতা')),
      floatingActionButton: FloatingActionButton.extended(
        key: const ValueKey('add-job-alert'),
        onPressed: _add,
        icon: const Icon(Icons.notification_add_outlined),
        label: const KLocalizedText('নতুন সতর্কতা'),
      ),
      body: alerts.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: KErrorState(
            failure: ErrorMapper.from(error),
            retryLabel: 'আবার চেষ্টা করুন',
            onRetry: () => ref.invalidate(jobAlertsProvider),
          ),
        ),
        data: (items) => items.isEmpty
            ? const Center(
                child: KEmptyState(
                  icon: Icons.notifications_none_rounded,
                  title: 'কোনো কাজের সতর্কতা নেই',
                  message:
                      'কাজের ধরন, দক্ষতা বা এলাকা বেছে নিন। মিলে যাওয়া নতুন কাজ এলে নোটিফিকেশন পাবেন।',
                ),
              )
            : ListView(
                padding: const EdgeInsets.fromLTRB(
                  KSpacing.md,
                  KSpacing.md,
                  KSpacing.md,
                  96,
                ),
                children: [
                  const KLocalizedText(
                    'সর্বোচ্চ ১০টি সতর্কতা রাখা যায়।',
                    style: TextStyle(color: KColors.textSecondary),
                  ),
                  const SizedBox(height: KSpacing.sm),
                  for (final alert in items)
                    Card(
                      key: ValueKey('job-alert-${alert.id}'),
                      margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
                      child: ListTile(
                        leading: const Icon(
                          Icons.notifications_active_outlined,
                          color: KColors.primary,
                        ),
                        title: Text(alert.labelFor(language)),
                        subtitle: Text(KFormat.date(context, alert.createdAt)),
                        trailing: _deleting.contains(alert.id)
                            ? const SizedBox.square(
                                dimension: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : IconButton(
                                key: ValueKey('delete-job-alert-${alert.id}'),
                                tooltip: KaajLocalizations.text(
                                  context,
                                  'সতর্কতা মুছুন',
                                ),
                                onPressed: () => _delete(alert),
                                icon: const Icon(Icons.delete_outline),
                              ),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

class _NewAlertSheet extends ConsumerStatefulWidget {
  const _NewAlertSheet();

  @override
  ConsumerState<_NewAlertSheet> createState() => _NewAlertSheetState();
}

class _NewAlertSheetState extends ConsumerState<_NewAlertSheet> {
  String? _categoryId;
  String? _skillId;
  String? _locationId;
  bool _saving = false;
  String? _error;

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(jobsRepositoryProvider)
          .createJobAlert(
            categoryId: _categoryId,
            skillId: _skillId,
            locationId: _locationId,
          );
      if (mounted) Navigator.pop(context, true);
    } on Object catch (error) {
      if (mounted) setState(() => _error = jobAlertFailureMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final categories = ref
        .watch(categoryTreeProvider)
        .maybeWhen(data: (items) => items, orElse: () => null);
    final skills = ref
        .watch(catalogSkillsProvider)
        .maybeWhen(data: (items) => items, orElse: () => null);
    final locations = ref
        .watch(catalogLocationsProvider)
        .maybeWhen(data: (items) => items, orElse: () => null);
    final visibleSkills = (skills ?? const [])
        .where(
          (skill) => _categoryId == null || skill.categoryId == _categoryId,
        )
        .toList(growable: false);
    final hasFilter =
        _categoryId != null || _skillId != null || _locationId != null;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          KSpacing.lg,
          0,
          KSpacing.lg,
          KSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              KLocalizedText(
                'নতুন কাজের সতর্কতা',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: KSpacing.xs),
              const KLocalizedText(
                'অন্তত একটি বেছে নিন। যেগুলো বাছবেন, নতুন কাজে সবগুলো মিললে জানানো হবে।',
                style: TextStyle(color: KColors.textSecondary),
              ),
              const SizedBox(height: KSpacing.md),
              DropdownButtonFormField<String>(
                key: const ValueKey('alert-category'),
                initialValue: _categoryId,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: KaajLocalizations.text(context, 'কাজের ধরন'),
                ),
                items: [
                  for (final category in _flatten(
                    categories ?? const <CatalogCategory>[],
                  ))
                    DropdownMenuItem(
                      value: category.item.id,
                      child: Text(
                        category.parent == null
                            ? category.item.nameFor(language)
                            : '${category.parent!.nameFor(language)} › ${category.item.nameFor(language)}',
                      ),
                    ),
                ],
                onChanged: (value) => setState(() {
                  _categoryId = value;
                  _skillId = null;
                }),
              ),
              const SizedBox(height: KSpacing.sm),
              DropdownButtonFormField<String>(
                key: ValueKey('alert-skill-$_categoryId'),
                initialValue: _skillId,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: KaajLocalizations.text(context, 'দক্ষতা'),
                ),
                items: [
                  for (final skill in visibleSkills)
                    DropdownMenuItem(
                      value: skill.id,
                      child: Text(skill.nameFor(language)),
                    ),
                ],
                onChanged: (value) => setState(() => _skillId = value),
              ),
              const SizedBox(height: KSpacing.sm),
              DropdownButtonFormField<String>(
                key: const ValueKey('alert-location'),
                initialValue: _locationId,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: KaajLocalizations.text(context, 'এলাকা'),
                ),
                items: [
                  for (final location in locations ?? const <ServiceLocation>[])
                    DropdownMenuItem(
                      value: location.id,
                      child: Text(location.nameFor(language)),
                    ),
                ],
                onChanged: (value) => setState(() => _locationId = value),
              ),
              if (_error case final message?) ...[
                const SizedBox(height: KSpacing.sm),
                KLocalizedText(
                  message,
                  style: const TextStyle(color: KColors.danger),
                ),
              ],
              const SizedBox(height: KSpacing.md),
              FilledButton(
                key: const ValueKey('save-job-alert'),
                onPressed: hasFilter && !_saving ? _save : null,
                child: const KLocalizedText('সতর্কতা চালু করুন'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Top-level work types followed by their subtypes. Alerts match either.
List<({CatalogCategory item, CatalogCategory? parent})> _flatten(
  List<CatalogCategory> categories,
) => [
  for (final category in categories) ...[
    (item: category, parent: null),
    for (final child in category.children) (item: child, parent: category),
  ],
];

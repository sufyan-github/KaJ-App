import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/money.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../../core/widgets/k_text_field.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import '../domain/business_models.dart';
import 'business_detail_screen.dart';
import 'business_providers.dart';
import 'business_widgets.dart';

/// Products and services of a business. Owners and managers add, edit
/// and remove them; anyone else sees the active ones and can report one.
class BusinessOfferingsScreen extends ConsumerStatefulWidget {
  const BusinessOfferingsScreen({required this.businessId, super.key});

  final String businessId;

  @override
  ConsumerState<BusinessOfferingsScreen> createState() =>
      _BusinessOfferingsScreenState();
}

class _BusinessOfferingsScreenState
    extends ConsumerState<BusinessOfferingsScreen> {
  final _busy = <String>{};

  String get _id => widget.businessId;

  Future<void> _edit([Offering? offering]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _OfferingForm(businessId: _id, initial: offering),
    );
    if (saved == true) ref.invalidate(businessOfferingsProvider(_id));
  }

  Future<void> _delete(Offering offering) async {
    if (_busy.contains(offering.id)) return;
    final confirmed = await confirmBusinessAction(
      context,
      title: 'এটি মুছে ফেলবেন?',
      message: 'পণ্য বা সেবাটি তালিকা থেকে সরে যাবে।',
      confirm: 'মুছে ফেলুন',
    );
    if (!confirmed || !mounted) return;
    setState(() => _busy.add(offering.id));
    try {
      await ref
          .read(businessRepositoryProvider)
          .deleteOffering(_id, offering.id);
      ref.invalidate(businessOfferingsProvider(_id));
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, 'মুছে ফেলা যায়নি।');
    } finally {
      if (mounted) setState(() => _busy.remove(offering.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final business = ref.watch(businessDetailProvider(_id)).valueOrNull;
    final canEdit = (business?.canEdit ?? false) && !business!.isSuspended;
    final offerings = ref.watch(businessOfferingsProvider(_id));
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('পণ্য ও সেবা')),
      floatingActionButton: canEdit
          ? FloatingActionButton.extended(
              key: const ValueKey('offering-add'),
              onPressed: _edit,
              icon: const Icon(Icons.add),
              label: const KLocalizedText('যোগ করুন'),
            )
          : null,
      body: offerings.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => BusinessLoadError(
          error: error,
          label: 'পণ্য ও সেবা লোড করা যায়নি।',
          onRetry: () => ref.invalidate(businessOfferingsProvider(_id)),
        ),
        data: (items) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(businessOfferingsProvider(_id));
            await ref
                .read(businessOfferingsProvider(_id).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              KSpacing.md,
              KSpacing.sm,
              KSpacing.md,
              KSpacing.xxl * 2,
            ),
            children: [
              if (items.isEmpty)
                KEmptyState(
                  icon: Icons.inventory_2_outlined,
                  title: 'এখনো কোনো পণ্য বা সেবা নেই',
                  message: canEdit
                      ? 'আপনার পণ্য বা সেবা যোগ করুন, যাতে ক্রেতা ও অংশীদাররা জানতে পারেন।'
                      : 'এই ব্যবসা এখনো কোনো পণ্য বা সেবা যোগ করেনি।',
                ),
              for (final offering in items)
                _OfferingTile(
                  offering: offering,
                  canEdit: canEdit,
                  isMember: business?.isMember ?? false,
                  busy: _busy.contains(offering.id),
                  onEdit: () => _edit(offering),
                  onDelete: () => _delete(offering),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OfferingTile extends StatelessWidget {
  const _OfferingTile({
    required this.offering,
    required this.canEdit,
    required this.isMember,
    required this.busy,
    required this.onEdit,
    required this.onDelete,
  });

  final Offering offering;
  final bool canEdit;
  final bool isMember;
  final bool busy;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final price = offeringPriceText(context, offering);
    final theme = Theme.of(context);
    return Card(
      key: ValueKey('offering-${offering.id}'),
      child: InkWell(
        onTap: canEdit && !offering.isHidden ? onEdit : null,
        child: Padding(
          padding: const EdgeInsets.all(KSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                offering.kind == OfferingKind.service
                    ? Icons.handyman_outlined
                    : Icons.inventory_2_outlined,
                color: KColors.primary,
              ),
              const SizedBox(width: KSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      offering.titleFor(language),
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: KSpacing.xs),
                    Wrap(
                      spacing: KSpacing.xs,
                      runSpacing: KSpacing.xs,
                      children: [
                        BusinessPill(
                          offering.kind == OfferingKind.service
                              ? 'সেবা'
                              : 'পণ্য',
                        ),
                        if (offering.isHidden)
                          const BusinessPill(
                            'KAAJ লুকিয়ে রেখেছে',
                            color: KColors.danger,
                          )
                        else if (!offering.isActive)
                          const BusinessPill('বন্ধ', color: KColors.warning),
                      ],
                    ),
                    if (price != null) ...[
                      const SizedBox(height: KSpacing.xs),
                      Text(price),
                    ],
                    if (offering.description != null) ...[
                      const SizedBox(height: KSpacing.xs),
                      Text(offering.description!),
                    ],
                    if (offering.isHidden) ...[
                      const SizedBox(height: KSpacing.xs),
                      const KLocalizedText(
                        'রিপোর্টের পরে এটি সবার কাছ থেকে লুকানো হয়েছে।',
                        style: TextStyle(color: KColors.danger),
                      ),
                      if (offering.hiddenReason != null)
                        Text(
                          offering.hiddenReason!,
                          key: const ValueKey('offering-hidden-reason'),
                        ),
                    ],
                  ],
                ),
              ),
              if (busy)
                const SizedBox.square(
                  dimension: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                PopupMenuButton<String>(
                  key: ValueKey('offering-menu-${offering.id}'),
                  onSelected: (value) => switch (value) {
                    'edit' => onEdit(),
                    'delete' => onDelete(),
                    _ => context.push(
                      AppRoutes.report('BUSINESS_OFFERING', offering.id),
                    ),
                  },
                  itemBuilder: (context) => [
                    if (canEdit && !offering.isHidden)
                      const PopupMenuItem(
                        value: 'edit',
                        child: KLocalizedText('বদলান'),
                      ),
                    if (canEdit)
                      const PopupMenuItem(
                        value: 'delete',
                        child: KLocalizedText('মুছে ফেলুন'),
                      ),
                    if (!isMember)
                      const PopupMenuItem(
                        value: 'report',
                        child: KLocalizedText('রিপোর্ট করুন'),
                      ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OfferingForm extends ConsumerStatefulWidget {
  const _OfferingForm({required this.businessId, this.initial});

  final String businessId;
  final Offering? initial;

  @override
  ConsumerState<_OfferingForm> createState() => _OfferingFormState();
}

class _OfferingFormState extends ConsumerState<_OfferingForm> {
  final _form = GlobalKey<FormState>();
  late final Offering? _initial = widget.initial;
  late OfferingKind _kind = _initial?.kind ?? OfferingKind.product;
  late final _titleBn = TextEditingController(text: _initial?.titleBn);
  late final _titleEn = TextEditingController(text: _initial?.titleEn);
  late final _description = TextEditingController(text: _initial?.description);
  late final _min = TextEditingController(text: _taka(_initial?.priceMin));
  late final _max = TextEditingController(text: _taka(_initial?.priceMax));
  late final _unit = TextEditingController(text: _initial?.priceUnit);
  late bool _active = _initial?.isActive ?? true;
  bool _saving = false;
  Object? _error;

  static String? _taka(Money? money) {
    if (money == null) return null;
    final poisha = money.poisha;
    return poisha % 100 == 0
        ? '${poisha ~/ 100}'
        : (poisha / 100).toStringAsFixed(2);
  }

  @override
  void dispose() {
    for (final controller in [
      _titleBn,
      _titleEn,
      _description,
      _min,
      _max,
      _unit,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _text(TextEditingController controller) {
    final value = controller.text.trim();
    return value.isEmpty ? null : value;
  }

  Future<void> _save() async {
    if (_saving || !_form.currentState!.validate()) return;
    final fields = <String, Object?>{
      'kind': _kind.wire,
      'titleBn': _text(_titleBn),
      'titleEn': _text(_titleEn),
      'description': _text(_description),
      'priceMinPoisha': takaToPoisha(_min.text),
      'priceMaxPoisha': takaToPoisha(_max.text),
      'priceUnit': _text(_unit),
      'isActive': _active,
    };
    // A new offering sends only what was filled in; an edit sends null to
    // clear a field.
    if (_initial == null) fields.removeWhere((_, value) => value == null);
    setState(() {
      _saving = true;
      _error = null;
    });
    final repository = ref.read(businessRepositoryProvider);
    try {
      if (_initial == null) {
        await repository.createOffering(widget.businessId, fields);
      } else {
        await repository.updateOffering(widget.businessId, _initial.id, fields);
      }
      if (mounted) Navigator.pop(context, true);
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String? _priceError(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return null;
    return takaToPoisha(text) == null ? 'সঠিক টাকার পরিমাণ লিখুন' : null;
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: Form(
      key: _form,
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(
          KSpacing.md,
          0,
          KSpacing.md,
          KSpacing.lg,
        ),
        children: [
          KLocalizedText(
            _initial == null ? 'পণ্য বা সেবা যোগ করুন' : 'পণ্য বা সেবা বদলান',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: KSpacing.sm),
          SegmentedButton<OfferingKind>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(
                value: OfferingKind.product,
                label: KLocalizedText('পণ্য'),
              ),
              ButtonSegment(
                value: OfferingKind.service,
                label: KLocalizedText('সেবা'),
              ),
            ],
            selected: {_kind},
            onSelectionChanged: (value) => setState(() => _kind = value.first),
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            key: const ValueKey('offering-title-bn'),
            label: 'নাম (বাংলা)',
            controller: _titleBn,
            validator: (value) {
              if ((value?.trim().length ?? 0) > 120) {
                return 'নাম ১২০ অক্ষরের বেশি হতে পারবে না';
              }
              return (value?.trim().isEmpty ?? true) &&
                      _titleEn.text.trim().isEmpty
                  ? 'বাংলা বা ইংরেজিতে অন্তত একটি নাম দিন'
                  : null;
            },
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            key: const ValueKey('offering-title-en'),
            label: 'নাম (ইংরেজি)',
            controller: _titleEn,
            validator: (value) => (value?.trim().length ?? 0) > 120
                ? 'নাম ১২০ অক্ষরের বেশি হতে পারবে না'
                : null,
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            label: 'বিবরণ',
            controller: _description,
            minLines: 2,
            maxLines: 4,
            validator: (value) => (value?.trim().length ?? 0) > 1000
                ? 'বিবরণ ১০০০ অক্ষরের বেশি হতে পারবে না'
                : null,
          ),
          const SizedBox(height: KSpacing.md),
          Row(
            children: [
              Expanded(
                child: KTextField(
                  key: const ValueKey('offering-min'),
                  label: 'সর্বনিম্ন দাম (টাকা)',
                  controller: _min,
                  keyboardType: TextInputType.number,
                  validator: _priceError,
                ),
              ),
              const SizedBox(width: KSpacing.sm),
              Expanded(
                child: KTextField(
                  key: const ValueKey('offering-max'),
                  label: 'সর্বোচ্চ দাম (টাকা)',
                  controller: _max,
                  keyboardType: TextInputType.number,
                  validator: (value) {
                    final error = _priceError(value);
                    if (error != null) return error;
                    final min = int.tryParse(takaToPoisha(_min.text) ?? '');
                    final max = int.tryParse(takaToPoisha(value ?? '') ?? '');
                    return min != null && max != null && max < min
                        ? 'সর্বোচ্চ দাম সর্বনিম্নের চেয়ে কম হতে পারে না'
                        : null;
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: KSpacing.md),
          KTextField(
            key: const ValueKey('offering-unit'),
            label: 'দামের একক (যেমন প্রতি কেজি)',
            controller: _unit,
            validator: (value) => (value?.trim().length ?? 0) > 40
                ? 'একক ৪০ অক্ষরের বেশি হতে পারবে না'
                : null,
          ),
          SwitchListTile(
            key: const ValueKey('offering-active'),
            contentPadding: EdgeInsets.zero,
            value: _active,
            onChanged: (value) => setState(() => _active = value),
            title: const KLocalizedText('চালু আছে'),
            subtitle: const KLocalizedText('বন্ধ থাকলে শুধু সদস্যরা দেখেন।'),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: KSpacing.sm),
              child: InlineError(
                message: failureText(context, _error!, 'সংরক্ষণ করা যায়নি।'),
              ),
            ),
          KPrimaryButton(
            key: const ValueKey('offering-save'),
            label: 'সংরক্ষণ করুন',
            isLoading: _saving,
            onPressed: _saving ? null : _save,
          ),
        ],
      ),
    ),
  );
}

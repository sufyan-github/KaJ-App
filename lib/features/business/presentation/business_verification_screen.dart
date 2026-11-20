import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../business_routes.dart';
import '../domain/business_models.dart';
import 'business_providers.dart';
import 'business_widgets.dart';

/// Verification of one registered business: the status for every member,
/// and the trade licence upload for the owner.
class BusinessVerificationScreen extends ConsumerStatefulWidget {
  const BusinessVerificationScreen({required this.businessId, super.key});

  final String businessId;

  @override
  ConsumerState<BusinessVerificationScreen> createState() =>
      _BusinessVerificationScreenState();
}

class _BusinessVerificationScreenState
    extends ConsumerState<BusinessVerificationScreen> {
  final _images = <Uint8List>[];
  bool _consent = false;
  bool _submitting = false;
  bool _needsIdentity = false;

  String get _id => widget.businessId;

  Future<void> _refresh() async {
    ref
      ..invalidate(businessDetailProvider(_id))
      ..invalidate(businessVerificationProvider(_id));
    await ref
        .read(businessVerificationProvider(_id).future)
        .then<void>((_) {}, onError: (_) {});
  }

  Future<void> _pick() async {
    final bytes = await ref.read(businessDocumentPickerProvider)();
    if (bytes != null && mounted) setState(() => _images.add(bytes));
  }

  Future<void> _submit() async {
    if (_submitting || _images.isEmpty || !_consent) return;
    setState(() {
      _submitting = true;
      _needsIdentity = false;
    });
    try {
      final upload = ref.read(businessDocumentUploaderProvider);
      final ids = <String>[];
      for (final image in _images) {
        ids.add(await upload(image));
      }
      await ref.read(businessRepositoryProvider).submitVerification(_id, ids);
      ref
        ..invalidate(businessVerificationProvider(_id))
        ..invalidate(businessDetailProvider(_id))
        ..invalidate(myBusinessesProvider);
      if (mounted) {
        setState(_images.clear);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: KLocalizedText(
              'যাচাইয়ের অনুরোধ জমা হয়েছে। ফল নোটিফিকেশনে জানানো হবে।',
            ),
          ),
        );
      }
    } on Object catch (error) {
      if (!mounted) return;
      final failure = ErrorMapper.from(error);
      final identity =
          failure.code == 'IDENTITY_REQUIRED' ||
          failure.message.toLowerCase().contains('identity');
      if (identity) {
        setState(() => _needsIdentity = true);
      } else {
        showFailureSnack(context, error, 'যাচাইয়ের অনুরোধ জমা দেওয়া যায়নি।');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final business = ref.watch(businessDetailProvider(_id));
    final verification = ref.watch(businessVerificationProvider(_id));
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('ব্যবসা যাচাই')),
      body: switch ((business, verification)) {
        (AsyncError(:final error), _) ||
        (_, AsyncError(:final error)) => RefreshIndicator(
          onRefresh: _refresh,
          child: BusinessLoadError(
            error: error,
            label: 'যাচাইয়ের অবস্থা লোড করা যায়নি।',
            onRetry: _refresh,
          ),
        ),
        (AsyncData(value: final b), AsyncData(value: final v)) =>
          RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(KSpacing.md),
              children: [
                _StatusCard(verification: v),
                const SizedBox(height: KSpacing.md),
                ..._next(b, v),
              ],
            ),
          ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }

  List<Widget> _next(Business business, BusinessVerification verification) {
    if (verification.verified || verification.status == 'APPROVED') {
      return const [
        KLocalizedText(
          'ব্যবসাটির পাশে যাচাইকৃত চিহ্ন দেখা যাবে। নাম, ট্রেড লাইসেন্স নম্বর বা পর্যায় বদলালে আবার যাচাই করতে হবে।',
        ),
      ];
    }
    if (verification.status == 'PENDING') {
      return const [
        KLocalizedText('KAAJ আপনার নথি দেখছে। সিদ্ধান্ত হলে নোটিফিকেশন পাবেন।'),
      ];
    }
    final registered =
        business.stage == BusinessStage.registered &&
        (business.tradeLicenceNo?.trim().isNotEmpty ?? false);
    if (!registered) {
      return [
        Card(
          key: const ValueKey('verification-not-registered'),
          color: KColors.surfaceAlt,
          child: Padding(
            padding: const EdgeInsets.all(KSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const KLocalizedText(
                  'শুধু ট্রেড লাইসেন্স নম্বরসহ নিবন্ধিত ব্যবসা যাচাই করা যায়। আইডিয়া বা অনিবন্ধিত ব্যবসা যাচাইকৃত হয় না, তবে প্রকাশ করা ও অংশীদার খোঁজা যায়।',
                ),
                if (business.canEdit) ...[
                  const SizedBox(height: KSpacing.sm),
                  OutlinedButton.icon(
                    key: const ValueKey('verification-edit'),
                    onPressed: () async {
                      await context.push(BusinessRoutes.edit(business.id));
                      await _refresh();
                    },
                    icon: const Icon(Icons.edit_outlined),
                    label: const KLocalizedText('পর্যায় ও লাইসেন্স নম্বর দিন'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ];
    }
    if (!business.isOwner) {
      return const [
        KLocalizedText('শুধু ব্যবসার মালিক যাচাইয়ের জন্য নথি জমা দিতে পারেন।'),
      ];
    }
    if (!verification.canSubmit) {
      return const [
        KLocalizedText('এখন যাচাইয়ের অনুরোধ জমা দেওয়া যাচ্ছে না।'),
      ];
    }
    return [
      if (_needsIdentity)
        Card(
          key: const ValueKey('verification-identity'),
          color: KColors.warning.withValues(alpha: .12),
          child: Padding(
            padding: const EdgeInsets.all(KSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const KLocalizedText(
                  'ব্যবসা যাচাইয়ের আগে আপনার পরিচয় (এনআইডি ও সেলফি) যাচাই করতে হবে।',
                ),
                const SizedBox(height: KSpacing.sm),
                OutlinedButton(
                  key: const ValueKey('verification-identity-go'),
                  onPressed: () =>
                      context.push(AppRoutes.verificationCapture('IDENTITY')),
                  child: const KLocalizedText('পরিচয় যাচাই করুন'),
                ),
              ],
            ),
          ),
        ),
      KLocalizedText(
        'ট্রেড লাইসেন্স ও অন্যান্য নথির ছবি দিন',
        style: Theme.of(context).textTheme.titleMedium,
      ),
      const SizedBox(height: KSpacing.xs),
      const KLocalizedText(
        'লেখা যেন পরিষ্কার পড়া যায়। ১ থেকে ৫টি ছবি দিন। নথি শুধু যাচাইয়ের জন্য ব্যবহৃত হয়।',
      ),
      const SizedBox(height: KSpacing.md),
      Wrap(
        spacing: KSpacing.sm,
        runSpacing: KSpacing.sm,
        children: [
          for (final (index, image) in _images.indexed)
            Stack(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.memory(
                    image,
                    width: 96,
                    height: 96,
                    fit: BoxFit.cover,
                  ),
                ),
                Positioned(
                  right: 0,
                  child: IconButton.filled(
                    tooltip: KaajLocalizations.text(context, 'ছবি সরান'),
                    visualDensity: VisualDensity.compact,
                    onPressed: _submitting
                        ? null
                        : () => setState(() => _images.removeAt(index)),
                    icon: const Icon(Icons.close, size: 18),
                  ),
                ),
              ],
            ),
          if (_images.length < 5)
            SizedBox(
              width: 96,
              height: 96,
              child: OutlinedButton(
                key: const ValueKey('verification-add-photo'),
                onPressed: _submitting ? null : _pick,
                child: const Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.add_a_photo_outlined),
                    KLocalizedText('ছবি দিন'),
                  ],
                ),
              ),
            ),
        ],
      ),
      const SizedBox(height: KSpacing.md),
      CheckboxListTile(
        key: const ValueKey('verification-consent'),
        value: _consent,
        onChanged: (value) => setState(() => _consent = value ?? false),
        controlAffinity: ListTileControlAffinity.leading,
        contentPadding: EdgeInsets.zero,
        title: const KLocalizedText(
          'আমি যাচাইয়ের জন্য এই নথি ব্যবহারে সম্মতি দিচ্ছি।',
        ),
      ),
      const SizedBox(height: KSpacing.sm),
      KPrimaryButton(
        key: const ValueKey('verification-submit'),
        label: 'যাচাইয়ের জন্য জমা দিন',
        isLoading: _submitting,
        onPressed: _images.isEmpty || !_consent || _submitting ? null : _submit,
      ),
    ];
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.verification});

  final BusinessVerification verification;

  @override
  Widget build(BuildContext context) {
    final status = verification.verified ? 'APPROVED' : verification.status;
    final (icon, color, label) = switch (status) {
      'APPROVED' => (Icons.verified, KColors.success, 'যাচাই সম্পন্ন'),
      'PENDING' => (Icons.hourglass_top, KColors.warning, 'পর্যালোচনাধীন'),
      'REJECTED' => (Icons.error_outline, KColors.danger, 'সংশোধন প্রয়োজন'),
      _ => (Icons.verified_outlined, KColors.textSecondary, 'জমা দেওয়া হয়নি'),
    };
    final latest = verification.latest;
    return Card(
      key: ValueKey('verification-status-$status'),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: color, size: 32),
                const SizedBox(width: KSpacing.md),
                Expanded(
                  child: KLocalizedText(
                    label,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            if (latest?.submittedAt != null) ...[
              const SizedBox(height: KSpacing.sm),
              Text(_submittedLine(context, latest!.submittedAt!)),
            ],
            if (status == 'REJECTED' && latest?.rejectionReason != null) ...[
              const SizedBox(height: KSpacing.sm),
              KLocalizedText(
                'কেন প্রত্যাখ্যাত: ${latest!.rejectionReason}\nনথি পরিষ্কার করে আবার জমা দিন।',
                key: const ValueKey('verification-rejection'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

String _submittedLine(BuildContext context, DateTime at) {
  final label = KaajLocalizations.text(context, 'জমা দেওয়া হয়েছে');
  return '$label: ${KFormat.dateTime(context, at)}';
}

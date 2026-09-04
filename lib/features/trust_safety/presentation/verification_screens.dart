import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/errors/failure.dart';
import '../../../core/permissions/permission_gateway.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../domain/trust_models.dart';
import 'trust_safety_providers.dart';

class VerificationCenterScreen extends ConsumerWidget {
  const VerificationCenterScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requests = ref.watch(verificationRequestsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('যাচাইকরণ কেন্দ্র')),
      body: requests.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _LoadError(
          error: error,
          retry: () => ref.invalidate(verificationRequestsProvider),
        ),
        data: (items) => RefreshIndicator(
          onRefresh: () => ref.refresh(verificationRequestsProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(KSpacing.md),
            children: [
              const _TrustHeader(),
              const SizedBox(height: KSpacing.md),
              _VerificationStep(
                title: 'ফোন',
                subtitle: 'OTP দিয়ে নিশ্চিত',
                icon: Icons.phone_android,
                status: 'APPROVED',
              ),
              _VerificationStep(
                title: 'পরিচয়',
                subtitle: 'জাতীয় পরিচয়পত্র ও সেলফি',
                icon: Icons.badge_outlined,
                status: _latest(items, 'IDENTITY')?.status,
                rejection: _latest(items, 'IDENTITY')?.rejectionReason,
                onTap: () =>
                    context.push(AppRoutes.verificationCapture('IDENTITY')),
              ),
              _VerificationStep(
                title: 'দক্ষতা',
                subtitle: 'সনদ, লাইসেন্স বা কাজের প্রমাণ',
                icon: Icons.workspace_premium_outlined,
                status: _latest(items, 'SKILL')?.status,
                rejection: _latest(items, 'SKILL')?.rejectionReason,
                onTap: () =>
                    context.push(AppRoutes.verificationCapture('SKILL')),
              ),
              _VerificationStep(
                title: 'ব্যবসা',
                subtitle: 'ট্রেড লাইসেন্স বা প্রতিষ্ঠানের নথি',
                icon: Icons.business_outlined,
                status: _latest(items, 'BUSINESS')?.status,
                rejection: _latest(items, 'BUSINESS')?.rejectionReason,
                onTap: () =>
                    context.push(AppRoutes.verificationCapture('BUSINESS')),
              ),
              const SizedBox(height: KSpacing.md),
              const Card(
                color: KColors.surfaceAlt,
                child: Padding(
                  padding: EdgeInsets.all(KSpacing.md),
                  child: Text(
                    'নথি শুধু যাচাইয়ের জন্য ব্যবহৃত হয়। অনুমোদন বা প্রত্যাখ্যানের পরে সংরক্ষণ নীতি অনুযায়ী এটি মুছে ফেলা হয়।',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  VerificationRequest? _latest(List<VerificationRequest> items, String kind) {
    for (final item in items) {
      if (item.kind == kind) return item;
    }
    return null;
  }
}

class _TrustHeader extends StatelessWidget {
  const _TrustHeader();
  @override
  Widget build(BuildContext context) => Card(
    color: KColors.primary,
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.lg),
      child: Row(
        children: [
          const Icon(Icons.verified_user, color: Colors.white, size: 42),
          const SizedBox(width: KSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'বিশ্বাস ধাপে ধাপে তৈরি হয়',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(color: Colors.white),
                ),
                const Text(
                  'ফোন → পরিচয় → দক্ষতা → ব্যবসা',
                  style: TextStyle(color: Colors.white),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _VerificationStep extends StatelessWidget {
  const _VerificationStep({
    required this.title,
    required this.subtitle,
    required this.icon,
    this.status,
    this.rejection,
    this.onTap,
  });
  final String title;
  final String subtitle;
  final IconData icon;
  final String? status;
  final String? rejection;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final approved = status == 'APPROVED';
    final pending = status == 'PENDING';
    final rejected = status == 'REJECTED';
    return Card(
      child: Column(
        children: [
          ListTile(
            onTap: pending || approved ? null : onTap,
            leading: CircleAvatar(
              backgroundColor: approved
                  ? KColors.success.withValues(alpha: .12)
                  : KColors.primary.withValues(alpha: .1),
              child: Icon(
                approved ? Icons.check : icon,
                color: approved ? KColors.success : KColors.primary,
              ),
            ),
            title: Text(title),
            subtitle: Text('$subtitle\n${_statusLabel(status)}'),
            isThreeLine: true,
            trailing: pending
                ? const Icon(Icons.hourglass_top, color: KColors.warning)
                : approved
                ? const Icon(Icons.verified, color: KColors.success)
                : const Icon(Icons.chevron_right),
          ),
          if (rejected && rejection?.isNotEmpty == true)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(KSpacing.md),
              color: KColors.danger.withValues(alpha: .06),
              child: Text(
                'কেন প্রত্যাখ্যাত: $rejection\nনথি পরিষ্কার করে আবার জমা দিন।',
              ),
            ),
        ],
      ),
    );
  }
}

String _statusLabel(String? status) => switch (status) {
  'APPROVED' => 'যাচাই সম্পন্ন',
  'PENDING' => 'পর্যালোচনাধীন',
  'REJECTED' => 'সংশোধন প্রয়োজন',
  _ => 'শুরু করা হয়নি',
};

class VerificationCaptureScreen extends ConsumerStatefulWidget {
  const VerificationCaptureScreen({required this.kind, super.key});
  final String kind;

  @override
  ConsumerState<VerificationCaptureScreen> createState() =>
      _VerificationCaptureScreenState();
}

class _VerificationCaptureScreenState
    extends ConsumerState<VerificationCaptureScreen> {
  final List<Uint8List> _images = [];
  bool _consent = false;
  bool _loading = false;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('${_kindLabel(widget.kind)} যাচাই')),
    body: ListView(
      padding: const EdgeInsets.all(KSpacing.lg),
      children: [
        Text(
          'নথি পরিষ্কারভাবে তুলুন',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: KSpacing.sm),
        const Text(
          'চার কোণা ফ্রেমে রাখুন, আলো বা ঝাপসা যেন না থাকে। নাম ও নম্বর পড়া যেতে হবে। সর্বোচ্চ ৫টি ছবি দিন।',
        ),
        const SizedBox(height: KSpacing.md),
        Wrap(
          spacing: KSpacing.sm,
          runSpacing: KSpacing.sm,
          children: [
            ..._images.asMap().entries.map(
              (entry) => Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.memory(
                      entry.value,
                      width: 96,
                      height: 96,
                      fit: BoxFit.cover,
                    ),
                  ),
                  Positioned(
                    right: 0,
                    child: IconButton.filled(
                      visualDensity: VisualDensity.compact,
                      onPressed: () =>
                          setState(() => _images.removeAt(entry.key)),
                      icon: const Icon(Icons.close, size: 18),
                    ),
                  ),
                ],
              ),
            ),
            if (_images.length < 5)
              SizedBox(
                width: 96,
                height: 96,
                child: OutlinedButton(
                  onPressed: _pick,
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add_a_photo_outlined),
                      Text('ছবি নিন'),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: KSpacing.md),
        CheckboxListTile(
          value: _consent,
          onChanged: (value) => setState(() => _consent = value ?? false),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          title: const Text(
            'আমি যাচাইয়ের জন্য এই নথি ব্যবহারে সম্মতি দিচ্ছি।',
          ),
        ),
        const SizedBox(height: KSpacing.md),
        KPrimaryButton(
          label: 'নিরাপদে জমা দিন',
          isLoading: _loading,
          onPressed: _images.isEmpty || !_consent ? null : _submit,
        ),
      ],
    ),
  );

  Future<void> _pick() async {
    final status = await const PermissionGateway().request(KPermission.camera);
    if (status != KPermissionStatus.granted) {
      if (mounted) _snack('ক্যামেরা অনুমতি না দিলে নথির ছবি তোলা যাবে না।');
      return;
    }
    final image = await ImagePicker().pickImage(
      source: ImageSource.camera,
      imageQuality: 92,
      maxWidth: 2400,
    );
    if (image != null) {
      final bytes = await image.readAsBytes();
      if (mounted) setState(() => _images.add(bytes));
    }
  }

  Future<void> _submit() async {
    setState(() => _loading = true);
    try {
      await ref
          .read(trustSafetyRepositoryProvider)
          .submitVerification(widget.kind, _images);
      ref.invalidate(verificationRequestsProvider);
      if (mounted) {
        _snack('যাচাই অনুরোধ জমা হয়েছে। ফল নোটিফিকেশনে জানানো হবে।');
        context.pop();
      }
    } on Object catch (error) {
      if (mounted) _snack(_message(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _snack(String message) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(message)));
}

String _kindLabel(String kind) => switch (kind) {
  'IDENTITY' => 'পরিচয়',
  'SKILL' => 'দক্ষতা',
  'BUSINESS' => 'ব্যবসা',
  _ => 'তথ্য',
};

String _message(Object error) =>
    error is Failure ? error.message : 'কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।';

class _LoadError extends StatelessWidget {
  const _LoadError({required this.error, required this.retry});
  final Object error;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_outlined, size: 44),
          const SizedBox(height: KSpacing.sm),
          Text(_message(error), textAlign: TextAlign.center),
          const SizedBox(height: KSpacing.md),
          FilledButton(onPressed: retry, child: const Text('আবার চেষ্টা করুন')),
        ],
      ),
    ),
  );
}

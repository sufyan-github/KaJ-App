import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/errors/failure.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../domain/trust_models.dart';
import 'trust_safety_providers.dart';

const disputeReasons = <String, String>{
  'NOT_COMPLETED': 'কাজ সম্পন্ন হয়নি',
  'POOR_QUALITY': 'কাজের মান ঠিক নয়',
  'NO_SHOW': 'উপস্থিত হননি',
  'OVERCHARGED': 'অতিরিক্ত টাকা চাওয়া হয়েছে',
  'UNSAFE_CONDITIONS': 'অনিরাপদ পরিবেশ',
  'DIFFERENT_SCOPE': 'চুক্তির বাইরে কাজ',
  'PAYMENT_NOT_RECEIVED': 'পারিশ্রমিক পাওয়া যায়নি',
  'HARASSMENT': 'হয়রানি',
  'OTHER': 'অন্যান্য',
};

class DisputesScreen extends ConsumerWidget {
  const DisputesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final disputes = ref.watch(disputesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('আমার বিরোধসমূহ')),
      body: disputes.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _Retry(
          error: error,
          onRetry: () => ref.invalidate(disputesProvider),
        ),
        data: (items) => items.isEmpty
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(KSpacing.lg),
                  child: Text(
                    'কোনো বিরোধ নেই। সমস্যা হলে কাজের বিস্তারিত পৃষ্ঠা থেকে বিরোধ খুলতে পারবেন।',
                    textAlign: TextAlign.center,
                  ),
                ),
              )
            : RefreshIndicator(
                onRefresh: () => ref.refresh(disputesProvider.future),
                child: ListView.separated(
                  padding: const EdgeInsets.all(KSpacing.md),
                  itemCount: items.length,
                  separatorBuilder: (_, _) =>
                      const SizedBox(height: KSpacing.sm),
                  itemBuilder: (context, index) {
                    final item = items[index];
                    return Card(
                      child: ListTile(
                        onTap: () => context.push(AppRoutes.dispute(item.id)),
                        leading: const Icon(
                          Icons.gavel_outlined,
                          color: KColors.primary,
                        ),
                        title: Text(item.jobTitle ?? 'কাজের বিরোধ'),
                        subtitle: Text(
                          '${disputeReasons[item.reasonCode] ?? item.reasonCode}\n${_status(item.status)}',
                        ),
                        isThreeLine: true,
                        trailing: const Icon(Icons.chevron_right),
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }
}

class OpenDisputeScreen extends ConsumerStatefulWidget {
  const OpenDisputeScreen({required this.assignmentId, super.key});
  final String assignmentId;
  @override
  ConsumerState<OpenDisputeScreen> createState() => _OpenDisputeScreenState();
}

class _OpenDisputeScreenState extends ConsumerState<OpenDisputeScreen> {
  final _description = TextEditingController();
  String _reason = disputeReasons.keys.first;
  bool _loading = false;
  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('বিরোধ খুলুন')),
    body: ListView(
      padding: const EdgeInsets.all(KSpacing.lg),
      children: [
        const Card(
          color: KColors.surfaceAlt,
          child: Padding(
            padding: EdgeInsets.all(KSpacing.md),
            child: Text(
              'বিরোধ খোলার সঙ্গে সঙ্গে সংশ্লিষ্ট পেমেন্ট স্থগিত হবে। উভয় পক্ষ প্রমাণ দেওয়ার জন্য ৪৮ ঘণ্টা পাবেন; সিদ্ধান্ত সাধারণত ৫ কর্মদিবসের মধ্যে জানানো হবে।',
            ),
          ),
        ),
        const SizedBox(height: KSpacing.md),
        DropdownButtonFormField<String>(
          initialValue: _reason,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'সমস্যার ধরন'),
          items: disputeReasons.entries
              .map(
                (entry) => DropdownMenuItem(
                  value: entry.key,
                  child: Text(entry.value),
                ),
              )
              .toList(),
          onChanged: (value) => setState(() => _reason = value ?? _reason),
        ),
        const SizedBox(height: KSpacing.md),
        TextField(
          controller: _description,
          minLines: 5,
          maxLines: 10,
          maxLength: 2000,
          decoration: const InputDecoration(
            labelText: 'কি ঘটেছে? (কমপক্ষে ২০ অক্ষর)',
            hintText: 'তারিখ, সময় এবং আপনি কী সমাধান চান তা লিখুন',
            alignLabelWithHint: true,
          ),
        ),
        const Text(
          'চুক্তি, KAAJ চ্যাট ও উপস্থিতির রেকর্ড স্বয়ংক্রিয়ভাবে প্রমাণে যুক্ত হবে।',
        ),
        const SizedBox(height: KSpacing.lg),
        KPrimaryButton(
          label: 'বিরোধ খুলুন ও পেমেন্ট স্থগিত করুন',
          isLoading: _loading,
          onPressed: _submit,
        ),
      ],
    ),
  );

  Future<void> _submit() async {
    if (_description.text.trim().length < 20) {
      _snack('বিস্তারিত কমপক্ষে ২০ অক্ষরে লিখুন।');
      return;
    }
    setState(() => _loading = true);
    try {
      final id = await ref
          .read(trustSafetyRepositoryProvider)
          .openDispute(widget.assignmentId, _reason, _description.text);
      ref.invalidate(disputesProvider);
      if (mounted) context.go(AppRoutes.dispute(id));
    } on Object catch (error) {
      if (mounted) _snack(_message(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _snack(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

class DisputeDetailScreen extends ConsumerWidget {
  const DisputeDetailScreen({required this.disputeId, super.key});
  final String disputeId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dispute = ref.watch(disputeProvider(disputeId));
    return Scaffold(
      appBar: AppBar(title: const Text('বিরোধের অগ্রগতি')),
      body: dispute.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _Retry(
          error: error,
          onRetry: () => ref.invalidate(disputeProvider(disputeId)),
        ),
        data: (item) => RefreshIndicator(
          onRefresh: () => ref.refresh(disputeProvider(disputeId).future),
          child: ListView(
            padding: const EdgeInsets.all(KSpacing.lg),
            children: [
              Text(
                item.jobTitle ?? 'কাজের বিরোধ',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: KSpacing.sm),
              Chip(
                avatar: const Icon(Icons.gavel, size: 18),
                label: Text(_status(item.status)),
              ),
              const SizedBox(height: KSpacing.md),
              _DeadlineCard(item: item),
              const SizedBox(height: KSpacing.md),
              Text(
                'আপনার বিবরণ',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text(item.description),
              const SizedBox(height: KSpacing.lg),
              Text('প্রমাণ', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: KSpacing.sm),
              ...item.evidence.map(
                (evidence) => Card(
                  child: ListTile(
                    leading: Icon(
                      evidence.hasAttachment
                          ? Icons.attachment
                          : Icons.description_outlined,
                    ),
                    title: Text(_evidenceLabel(evidence.kind)),
                    subtitle: evidence.text == null
                        ? null
                        : Text(
                            evidence.text!,
                            maxLines: 4,
                            overflow: TextOverflow.ellipsis,
                          ),
                  ),
                ),
              ),
              if (item.status == 'EVIDENCE' &&
                  item.evidenceDueAt.isAfter(DateTime.now())) ...[
                OutlinedButton.icon(
                  onPressed: () => _addText(context, ref),
                  icon: const Icon(Icons.note_add_outlined),
                  label: const Text('লিখিত প্রমাণ যোগ করুন'),
                ),
                OutlinedButton.icon(
                  onPressed: () => _addPhoto(context, ref),
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                  label: const Text('ছবির প্রমাণ যোগ করুন'),
                ),
              ],
              if (item.decision != null) ...[
                const SizedBox(height: KSpacing.lg),
                Text(
                  'সিদ্ধান্ত ও কারণ',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(KSpacing.md),
                    child: Text(item.decision!),
                  ),
                ),
              ],
              if (item.status == 'RESOLVED' &&
                  item.resolvedAt != null &&
                  item.appealStatus == null &&
                  DateTime.now().isBefore(
                    item.resolvedAt!.add(const Duration(hours: 72)),
                  ))
                OutlinedButton.icon(
                  onPressed: () => _appeal(context, ref),
                  icon: const Icon(Icons.replay_outlined),
                  label: const Text('৭২ ঘণ্টার মধ্যে আপিল করুন'),
                ),
              if (item.appealStatus != null)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.balance_outlined),
                    title: const Text('স্বতন্ত্র আপিল পর্যালোচনা'),
                    subtitle: Text(_status(item.appealStatus!)),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _addText(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('লিখিত প্রমাণ'),
        content: TextField(
          controller: controller,
          minLines: 4,
          maxLines: 8,
          decoration: const InputDecoration(
            hintText: 'কি প্রমাণ করে এবং কখন ঘটেছে লিখুন',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('বাতিল'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('যোগ করুন'),
          ),
        ],
      ),
    );
    if (ok != true || controller.text.trim().length < 3) return;
    if (!context.mounted) return;
    await _run(
      context,
      ref,
      () => ref
          .read(trustSafetyRepositoryProvider)
          .addTextEvidence(disputeId, controller.text),
    );
  }

  Future<void> _addPhoto(BuildContext context, WidgetRef ref) async {
    final image = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 90,
      maxWidth: 2400,
    );
    if (image == null) return;
    if (!context.mounted) return;
    await _run(
      context,
      ref,
      () async => ref
          .read(trustSafetyRepositoryProvider)
          .addPhotoEvidence(disputeId, await image.readAsBytes()),
    );
  }

  Future<void> _appeal(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('আপিলের কারণ'),
        content: TextField(
          controller: controller,
          minLines: 4,
          maxLines: 8,
          decoration: const InputDecoration(
            hintText: 'সিদ্ধান্তে কী বাদ পড়েছে? কমপক্ষে ২০ অক্ষর',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('বাতিল'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('আপিল করুন'),
          ),
        ],
      ),
    );
    if (ok != true || controller.text.trim().length < 20) return;
    if (!context.mounted) return;
    await _run(
      context,
      ref,
      () => ref
          .read(trustSafetyRepositoryProvider)
          .appeal(disputeId, controller.text),
    );
  }

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    Future<void> Function() action,
  ) async {
    try {
      await action();
      ref.invalidate(disputeProvider(disputeId));
      ref.invalidate(disputesProvider);
      if (context.mounted) _snack(context, 'তথ্য নিরাপদে জমা হয়েছে।');
    } on Object catch (error) {
      if (context.mounted) _snack(context, _message(error));
    }
  }

  void _snack(BuildContext context, String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

class _DeadlineCard extends StatelessWidget {
  const _DeadlineCard({required this.item});
  final DisputeSummary item;
  @override
  Widget build(BuildContext context) {
    final due = item.status == 'EVIDENCE'
        ? item.evidenceDueAt
        : item.resolutionDueAt;
    final remaining = due.difference(DateTime.now());
    final text = remaining.isNegative
        ? 'সময়সীমা পার হয়েছে'
        : '${remaining.inHours ~/ 24} দিন ${remaining.inHours.remainder(24)} ঘণ্টা বাকি';
    return Card(
      color: KColors.warning.withValues(alpha: .08),
      child: ListTile(
        leading: const Icon(Icons.timer_outlined, color: KColors.warning),
        title: Text(
          item.status == 'EVIDENCE'
              ? 'প্রমাণ জমার সময়'
              : 'সিদ্ধান্তের লক্ষ্য সময়',
        ),
        subtitle: Text(text),
      ),
    );
  }
}

class _Retry extends StatelessWidget {
  const _Retry({required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(_message(error), textAlign: TextAlign.center),
          const SizedBox(height: KSpacing.md),
          FilledButton(
            onPressed: onRetry,
            child: const Text('আবার চেষ্টা করুন'),
          ),
        ],
      ),
    ),
  );
}

String _message(Object error) => error is Failure
    ? error.message
    : 'তথ্য লোড বা জমা হয়নি। আবার চেষ্টা করুন।';
String _status(String status) => switch (status) {
  'EVIDENCE' => 'প্রমাণ সংগ্রহ চলছে',
  'UNDER_REVIEW' => 'পর্যালোচনাধীন',
  'RESOLVED' => 'সিদ্ধান্ত হয়েছে',
  'PENDING' => 'অপেক্ষমাণ',
  'UPHELD' => 'আপিল গৃহীত',
  'DENIED' => 'আপিল নাকচ',
  _ => status,
};
String _evidenceLabel(String kind) => switch (kind) {
  'SYSTEM_CONTRACT_SNAPSHOT' => 'চুক্তির স্বয়ংক্রিয় রেকর্ড',
  'SYSTEM_CHAT_TRANSCRIPT' => 'KAAJ চ্যাটের স্বয়ংক্রিয় রেকর্ড',
  'SYSTEM_CHECKIN_SNAPSHOT' => 'উপস্থিতির স্বয়ংক্রিয় রেকর্ড',
  'TEXT' => 'লিখিত প্রমাণ',
  'PHOTO' => 'ছবির প্রমাণ',
  'DOCUMENT' => 'নথির প্রমাণ',
  _ => 'প্রমাণ',
};

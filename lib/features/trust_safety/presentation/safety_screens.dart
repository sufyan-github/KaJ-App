import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/errors/failure.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../catalog/presentation/controllers/catalog_providers.dart';
import '../domain/trust_models.dart';
import 'trust_safety_providers.dart';

const reportReasons = <String, String>{
  'HARASSMENT': 'হয়রানি বা হুমকি',
  'SCAM': 'প্রতারণা',
  'WAGE_THEFT': 'পারিশ্রমিক না দেওয়া',
  'UNSAFE_WORK': 'অনিরাপদ কাজ',
  'DISCRIMINATION': 'বৈষম্য',
  'INAPPROPRIATE_CONTENT': 'আপত্তিকর বিষয়বস্তু',
  'IMPERSONATION': 'ভুয়া পরিচয়',
  'OFF_PLATFORM_PAYMENT': 'KAAJ-এর বাইরে টাকা চাওয়া',
  'NO_SHOW': 'উপস্থিত হননি',
  'OTHER': 'অন্যান্য',
};

class ReportScreen extends ConsumerStatefulWidget {
  const ReportScreen({
    required this.targetType,
    required this.targetId,
    super.key,
  });
  final String targetType;
  final String targetId;
  @override
  ConsumerState<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends ConsumerState<ReportScreen> {
  final _description = TextEditingController();
  String _reason = reportReasons.keys.first;
  bool _loading = false;
  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('নিরাপত্তা রিপোর্ট')),
    body: ListView(
      padding: const EdgeInsets.all(KSpacing.lg),
      children: [
        const Card(
          color: KColors.surfaceAlt,
          child: ListTile(
            leading: Icon(Icons.shield_outlined, color: KColors.primary),
            title: Text('রিপোর্ট গোপন রাখা হয়'),
            subtitle: Text(
              'যাকে রিপোর্ট করছেন তিনি আপনার পরিচয় বা বিবরণ দেখতে পাবেন না। জরুরি বিপদে ৯৯৯-এ কল করুন।',
            ),
          ),
        ),
        const SizedBox(height: KSpacing.md),
        DropdownButtonFormField<String>(
          initialValue: _reason,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'রিপোর্টের কারণ'),
          items: reportReasons.entries
              .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
              .toList(),
          onChanged: (value) => setState(() => _reason = value ?? _reason),
        ),
        const SizedBox(height: KSpacing.md),
        TextField(
          controller: _description,
          minLines: 5,
          maxLines: 10,
          maxLength: 1000,
          decoration: const InputDecoration(
            labelText: 'কি ঘটেছে? (কমপক্ষে ১০ অক্ষর)',
            hintText: 'ঘটনার সময় ও গুরুত্বপূর্ণ তথ্য লিখুন',
            alignLabelWithHint: true,
          ),
        ),
        const SizedBox(height: KSpacing.md),
        KPrimaryButton(
          label: 'রিপোর্ট জমা দিন',
          isLoading: _loading,
          onPressed: _submit,
        ),
      ],
    ),
  );

  Future<void> _submit() async {
    if (_description.text.trim().length < 10) {
      _snack('বিস্তারিত কমপক্ষে ১০ অক্ষরে লিখুন।');
      return;
    }
    setState(() => _loading = true);
    try {
      await ref
          .read(trustSafetyRepositoryProvider)
          .report(
            targetType: widget.targetType,
            targetId: widget.targetId,
            reasonCode: _reason,
            description: _description.text,
          );
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            icon: const Icon(
              Icons.check_circle,
              color: KColors.success,
              size: 44,
            ),
            title: const Text('রিপোর্ট পাওয়া গেছে'),
            content: const Text(
              'নিরাপত্তা দল এটি পর্যালোচনা করবে। প্রয়োজন হলে নোটিফিকেশনে আপডেট পাবেন।',
            ),
            actions: [
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('ঠিক আছে'),
              ),
            ],
          ),
        );
        if (mounted) Navigator.pop(context);
      }
    } on Object catch (error) {
      if (mounted) _snack(_message(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _snack(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

class BlockedUsersScreen extends ConsumerWidget {
  const BlockedUsersScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final users = ref.watch(blockedUsersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('ব্লক করা ব্যবহারকারী')),
      body: users.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: FilledButton(
            onPressed: () => ref.invalidate(blockedUsersProvider),
            child: Text(_message(error)),
          ),
        ),
        data: (items) => items.isEmpty
            ? const Center(child: Text('আপনি কাউকে ব্লক করেননি।'))
            : ListView.separated(
                padding: const EdgeInsets.all(KSpacing.md),
                itemCount: items.length,
                separatorBuilder: (_, _) => const Divider(),
                itemBuilder: (context, index) {
                  final user = items[index];
                  return ListTile(
                    leading: const CircleAvatar(
                      child: Icon(Icons.person_off_outlined),
                    ),
                    title: Text(user.displayName),
                    subtitle: const Text('বার্তা ও নতুন যোগাযোগ বন্ধ আছে'),
                    trailing: TextButton(
                      onPressed: () async {
                        try {
                          await ref
                              .read(trustSafetyRepositoryProvider)
                              .unblock(user.userId);
                          ref.invalidate(blockedUsersProvider);
                        } on Object catch (error) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(_message(error))),
                            );
                          }
                        }
                      },
                      child: const Text('আনব্লক'),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class PortfolioScreen extends ConsumerWidget {
  const PortfolioScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfolio = ref.watch(portfolioProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('কাজের পোর্টফোলিও')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _add(context, ref),
        icon: const Icon(Icons.add_a_photo_outlined),
        label: const Text('কাজ যোগ করুন'),
      ),
      body: portfolio.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: FilledButton(
            onPressed: () => ref.invalidate(portfolioProvider),
            child: Text(_message(error)),
          ),
        ),
        data: (items) => items.isEmpty
            ? const _EmptyPortfolio()
            : RefreshIndicator(
                onRefresh: () => ref.refresh(portfolioProvider.future),
                child: GridView.builder(
                  padding: const EdgeInsets.all(KSpacing.md),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: KSpacing.sm,
                    mainAxisSpacing: KSpacing.sm,
                    childAspectRatio: .72,
                  ),
                  itemCount: items.length,
                  itemBuilder: (context, index) => _PortfolioCard(
                    item: items[index],
                    onDelete: () => _delete(context, ref, items[index].id),
                  ),
                ),
              ),
      ),
    );
  }

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final categories = await ref.read(categoryTreeProvider.future);
    if (!context.mounted || categories.isEmpty) return;
    final image = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 90,
      maxWidth: 2200,
    );
    if (image == null || !context.mounted) return;
    final caption = TextEditingController();
    var categoryId = categories.first.id;
    final accepted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(
            KSpacing.lg,
            0,
            KSpacing.lg,
            MediaQuery.viewInsetsOf(context).bottom + KSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('কাজের তথ্য', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: KSpacing.md),
              DropdownButtonFormField<String>(
                initialValue: categoryId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'কাজের ধরন'),
                items: categories
                    .map(
                      (item) => DropdownMenuItem(
                        value: item.id,
                        child: Text(item.nameBn),
                      ),
                    )
                    .toList(),
                onChanged: (value) =>
                    setModalState(() => categoryId = value ?? categoryId),
              ),
              const SizedBox(height: KSpacing.md),
              TextField(
                controller: caption,
                maxLength: 300,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'ক্যাপশন (ঐচ্ছিক)',
                  hintText: 'কাজটি সম্পর্কে সংক্ষেপে লিখুন',
                ),
              ),
              KPrimaryButton(
                label: 'নিরাপদে আপলোড করুন',
                onPressed: () => Navigator.pop(context, true),
              ),
            ],
          ),
        ),
      ),
    );
    if (accepted != true || !context.mounted) return;
    try {
      await ref
          .read(trustSafetyRepositoryProvider)
          .addPortfolioItem(
            image: await image.readAsBytes(),
            categoryId: categoryId,
            caption: caption.text,
          );
      ref.invalidate(portfolioProvider);
    } on Object catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(_message(error))));
      }
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('এই কাজের ছবি মুছবেন?'),
        content: const Text('ছবিটি স্থায়ীভাবে মুছে যাবে।'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('বাতিল'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('মুছুন'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(trustSafetyRepositoryProvider).deletePortfolioItem(id);
      ref.invalidate(portfolioProvider);
    } on Object catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(_message(error))));
      }
    }
  }
}

class _EmptyPortfolio extends StatelessWidget {
  const _EmptyPortfolio();
  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(KSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.photo_library_outlined, size: 56, color: KColors.primary),
          SizedBox(height: KSpacing.md),
          Text(
            'আপনার কাজ দেখান — বেশি কাজ পান',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
          ),
          SizedBox(height: KSpacing.sm),
          Text(
            'ছবি, ক্যাপশন ও কাজের ধরনসহ সর্বোচ্চ ২০টি নমুনা যোগ করুন।',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    ),
  );
}

class _PortfolioCard extends StatelessWidget {
  const _PortfolioCard({required this.item, required this.onDelete});
  final PortfolioItem item;
  final VoidCallback onDelete;
  @override
  Widget build(BuildContext context) => Card(
    clipBehavior: Clip.antiAlias,
    margin: EdgeInsets.zero,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Image.network(
            item.imageUrl,
            width: double.infinity,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) =>
                const Center(child: Icon(Icons.broken_image_outlined)),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            KSpacing.sm,
            KSpacing.sm,
            0,
            KSpacing.xs,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  item.categoryName,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
              ),
              IconButton(
                onPressed: onDelete,
                tooltip: 'মুছুন',
                icon: const Icon(Icons.delete_outline),
              ),
            ],
          ),
        ),
        if (item.caption != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              KSpacing.sm,
              0,
              KSpacing.sm,
              KSpacing.sm,
            ),
            child: Text(
              item.caption!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
      ],
    ),
  );
}

String _message(Object error) =>
    error is Failure ? error.message : 'কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।';

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/errors/failure.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_network_image.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../catalog/domain/entities/catalog_category.dart';
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
    appBar: AppBar(title: const KLocalizedText('নিরাপত্তা রিপোর্ট')),
    body: Column(
      children: [
        Expanded(
          child: ListView(
            primary: true,
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.all(KSpacing.lg),
            children: [
              const Card(
                color: KColors.surfaceAlt,
                child: ListTile(
                  leading: Icon(Icons.shield_outlined, color: KColors.primary),
                  title: KLocalizedText('রিপোর্ট গোপন রাখা হয়'),
                  subtitle: KLocalizedText(
                    'যাকে রিপোর্ট করছেন তিনি আপনার পরিচয় বা বিবরণ দেখতে পাবেন না। জরুরি বিপদে ৯৯৯-এ কল করুন।',
                  ),
                ),
              ),
              const SizedBox(height: KSpacing.md),
              DropdownButtonFormField<String>(
                initialValue: _reason,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: KaajLocalizations.text(context, 'রিপোর্টের কারণ'),
                ),
                items: reportReasons.entries
                    .map(
                      (e) => DropdownMenuItem(
                        value: e.key,
                        child: KLocalizedText(e.value),
                      ),
                    )
                    .toList(),
                onChanged: (value) =>
                    setState(() => _reason = value ?? _reason),
              ),
              const SizedBox(height: KSpacing.md),
              TextField(
                controller: _description,
                minLines: 3,
                maxLines: 8,
                maxLength: 1000,
                decoration: InputDecoration(
                  labelText: KaajLocalizations.text(
                    context,
                    'কি ঘটেছে? (কমপক্ষে ১০ অক্ষর)',
                  ),
                  hintText: KaajLocalizations.text(
                    context,
                    'ঘটনার সময় ও গুরুত্বপূর্ণ তথ্য লিখুন',
                  ),
                  alignLabelWithHint: true,
                ),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          minimum: const EdgeInsets.fromLTRB(
            KSpacing.lg,
            KSpacing.sm,
            KSpacing.lg,
            KSpacing.md,
          ),
          child: KPrimaryButton(
            label: 'রিপোর্ট জমা দিন',
            isLoading: _loading,
            onPressed: _submit,
          ),
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
            title: const KLocalizedText('রিপোর্ট পাওয়া গেছে'),
            content: const KLocalizedText(
              'নিরাপত্তা দল এটি পর্যালোচনা করবে। প্রয়োজন হলে নোটিফিকেশনে আপডেট পাবেন।',
            ),
            actions: [
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const KLocalizedText('ঠিক আছে'),
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

  void _snack(String text) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: KLocalizedText(text)));
}

class BlockedUsersScreen extends ConsumerWidget {
  const BlockedUsersScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final users = ref.watch(blockedUsersProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('ব্লক করা ব্যবহারকারী')),
      body: users.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: FilledButton(
            onPressed: () => ref.invalidate(blockedUsersProvider),
            child: KLocalizedText(_message(error)),
          ),
        ),
        data: (items) => items.isEmpty
            ? const Center(child: KLocalizedText('আপনি কাউকে ব্লক করেননি।'))
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
                    subtitle: const KLocalizedText(
                      'বার্তা ও নতুন যোগাযোগ বন্ধ আছে',
                    ),
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
                              SnackBar(
                                content: KLocalizedText(_message(error)),
                              ),
                            );
                          }
                        }
                      },
                      child: const KLocalizedText('আনব্লক'),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class PortfolioScreen extends ConsumerStatefulWidget {
  const PortfolioScreen({super.key});

  @override
  ConsumerState<PortfolioScreen> createState() => _PortfolioScreenState();
}

class _PortfolioScreenState extends ConsumerState<PortfolioScreen> {
  static const _maxItems = 20;
  static const _maxSourceBytes = 5 * 1024 * 1024;

  final Set<String> _busyIds = <String>{};
  _PortfolioDraft? _pendingDraft;
  CancelToken? _uploadCancelToken;
  double _uploadProgress = 0;
  bool _uploading = false;
  bool _reordering = false;

  @override
  Widget build(BuildContext context) {
    final portfolio = ref.watch(portfolioProvider);
    final itemCount = portfolio.valueOrNull?.length ?? 0;
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('কাজের পোর্টফোলিও')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _uploading || itemCount >= _maxItems
            ? null
            : () => _startAdd(itemCount),
        icon: _uploading
            ? const SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.add_a_photo_outlined),
        label: KLocalizedText(
          itemCount >= _maxItems
              ? 'সীমা পূর্ণ'
              : _uploading
              ? 'আপলোড হচ্ছে'
              : 'কাজ যোগ করুন',
        ),
      ),
      body: portfolio.when(
        loading: () => const _PortfolioLoading(),
        error: (error, _) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(KSpacing.xl),
          children: [
            const SizedBox(height: KSpacing.xxl),
            const Icon(
              Icons.cloud_off_outlined,
              size: 52,
              color: KColors.textSecondary,
            ),
            const SizedBox(height: KSpacing.md),
            KLocalizedText(
              'পোর্টফোলিও লোড করা যায়নি',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: KSpacing.sm),
            KLocalizedText(
              _portfolioMessage(error),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: KSpacing.lg),
            FilledButton.icon(
              onPressed: () => ref.invalidate(portfolioProvider),
              icon: const Icon(Icons.refresh),
              label: const KLocalizedText('আবার চেষ্টা করুন'),
            ),
          ],
        ),
        data: (items) => RefreshIndicator(
          onRefresh: () => ref.refresh(portfolioProvider.future),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(
                  KSpacing.md,
                  KSpacing.md,
                  KSpacing.md,
                  0,
                ),
                sliver: SliverToBoxAdapter(
                  child: _PortfolioSummary(
                    itemCount: items.length,
                    canReorder: items.length > 1,
                    reordering: _reordering,
                    onReorder: () => _showReorder(items),
                  ),
                ),
              ),
              if (_pendingDraft != null)
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(
                    KSpacing.md,
                    KSpacing.md,
                    KSpacing.md,
                    0,
                  ),
                  sliver: SliverToBoxAdapter(
                    child: _PendingUploadCard(
                      draft: _pendingDraft!,
                      progress: _uploadProgress,
                      uploading: _uploading,
                      onCancel: _cancelOrDiscardUpload,
                      onRetry: _uploading ? null : _uploadPending,
                    ),
                  ),
                ),
              if (items.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _EmptyPortfolio(onAdd: () => _startAdd(items.length)),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(
                    KSpacing.md,
                    KSpacing.md,
                    KSpacing.md,
                    112,
                  ),
                  sliver: SliverGrid.builder(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: MediaQuery.sizeOf(context).width >= 680
                          ? 3
                          : 2,
                      crossAxisSpacing: KSpacing.sm,
                      mainAxisSpacing: KSpacing.sm,
                      mainAxisExtent: _cardHeight(context),
                    ),
                    itemCount: items.length,
                    itemBuilder: (context, index) => _PortfolioCard(
                      item: items[index],
                      busy: _busyIds.contains(items[index].id),
                      onOpen: () => _showPreview(items[index]),
                      onEdit: () => _edit(items[index]),
                      onDelete: () => _delete(items[index].id),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  double _cardHeight(BuildContext context) {
    final scale = MediaQuery.textScalerOf(context).scale(16) / 16;
    return 286 + ((scale - 1).clamp(0, 1) * 82);
  }

  Future<void> _startAdd(int itemCount) async {
    if (itemCount >= _maxItems) {
      _snack('সর্বোচ্চ ২০টি কাজের নমুনা রাখা যায়।');
      return;
    }
    try {
      final source = await _chooseImageSource();
      if (source == null || !mounted) return;
      final picked = await ImagePicker().pickImage(
        source: source,
        imageQuality: 92,
        maxWidth: 2400,
      );
      if (picked == null || !mounted) return;
      final bytes = await picked.readAsBytes();
      if (!_isSupportedImage(bytes)) {
        _snack('শুধু JPEG বা PNG ছবি যোগ করা যাবে।');
        return;
      }
      if (bytes.length > _maxSourceBytes) {
        _snack('ছবিটি ৫ MB-এর বেশি। ছোট একটি ছবি বেছে নিন।');
        return;
      }
      final categories = await ref.read(categoryTreeProvider.future);
      if (!mounted) return;
      if (categories.isEmpty) {
        _snack('কাজের ধরন পাওয়া যায়নি। আবার চেষ্টা করুন।');
        return;
      }
      final details = await showModalBottomSheet<_PortfolioDetails>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) =>
            _PortfolioDetailsSheet(categories: categories, previewBytes: bytes),
      );
      if (details == null || !mounted) return;
      setState(() {
        _pendingDraft = _PortfolioDraft(
          bytes: bytes,
          categoryId: details.categoryId,
          categoryName: details.categoryName,
          caption: details.caption,
        );
      });
      await _uploadPending();
    } on Object catch (error) {
      if (mounted) _snack(_portfolioMessage(error));
    }
  }

  Future<ImageSource?> _chooseImageSource() =>
      showModalBottomSheet<ImageSource>(
        context: context,
        showDragHandle: true,
        builder: (context) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              KSpacing.md,
              0,
              KSpacing.md,
              KSpacing.md,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                KLocalizedText(
                  'ছবি যোগ করুন',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: KSpacing.md),
                ListTile(
                  leading: const Icon(Icons.photo_camera_outlined),
                  title: const KLocalizedText('ক্যামেরা দিয়ে তুলুন'),
                  subtitle: const KLocalizedText(
                    'এখনই কাজের একটি পরিষ্কার ছবি তুলুন',
                  ),
                  onTap: () => Navigator.pop(context, ImageSource.camera),
                ),
                ListTile(
                  leading: const Icon(Icons.photo_library_outlined),
                  title: const KLocalizedText('গ্যালারি থেকে নিন'),
                  subtitle: const KLocalizedText(
                    'আগে তোলা JPEG বা PNG ছবি বেছে নিন',
                  ),
                  onTap: () => Navigator.pop(context, ImageSource.gallery),
                ),
              ],
            ),
          ),
        ),
      );

  Future<void> _uploadPending() async {
    final draft = _pendingDraft;
    if (draft == null || _uploading) return;
    final cancelToken = CancelToken();
    setState(() {
      _uploading = true;
      _uploadProgress = 0;
      _uploadCancelToken = cancelToken;
    });
    try {
      await ref
          .read(trustSafetyRepositoryProvider)
          .addPortfolioItem(
            image: draft.bytes,
            categoryId: draft.categoryId,
            caption: draft.caption,
            cancelToken: cancelToken,
            onProgress: (value) {
              if (mounted) setState(() => _uploadProgress = value);
            },
          );
      if (!mounted) return;
      setState(() => _pendingDraft = null);
      ref.invalidate(portfolioProvider);
      _snack('কাজের নমুনা পোর্টফোলিওতে যোগ হয়েছে।');
    } on Object catch (error) {
      if (mounted) {
        _snack(
          cancelToken.isCancelled
              ? 'আপলোড বাতিল হয়েছে। চাইলে আবার চেষ্টা করুন।'
              : _portfolioMessage(error),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _uploading = false;
          _uploadCancelToken = null;
        });
      }
    }
  }

  void _cancelOrDiscardUpload() {
    if (_uploading) {
      _uploadCancelToken?.cancel('Cancelled by user');
      return;
    }
    setState(() {
      _pendingDraft = null;
      _uploadProgress = 0;
    });
  }

  Future<void> _edit(PortfolioItem item) async {
    if (_busyIds.contains(item.id)) return;
    try {
      final categories = await ref.read(categoryTreeProvider.future);
      if (!mounted || categories.isEmpty) return;
      final details = await showModalBottomSheet<_PortfolioDetails>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _PortfolioDetailsSheet(
          categories: categories,
          initialCategoryId: item.categoryId,
          initialCaption: item.caption,
          submitLabel: 'পরিবর্তন সংরক্ষণ করুন',
        ),
      );
      if (details == null || !mounted) return;
      setState(() => _busyIds.add(item.id));
      await ref
          .read(trustSafetyRepositoryProvider)
          .updatePortfolioItem(
            id: item.id,
            categoryId: details.categoryId,
            caption: details.caption,
          );
      ref.invalidate(portfolioProvider);
      _snack('পোর্টফোলিওর তথ্য আপডেট হয়েছে।');
    } on Object catch (error) {
      if (mounted) _snack(_portfolioMessage(error));
    } finally {
      if (mounted) setState(() => _busyIds.remove(item.id));
    }
  }

  Future<void> _showReorder(List<PortfolioItem> items) async {
    if (_reordering) return;
    final order = [...items];
    final accepted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * .76,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                KSpacing.md,
                0,
                KSpacing.md,
                KSpacing.md,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  KLocalizedText(
                    'কাজের নমুনার ক্রম',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: KSpacing.xs),
                  const KLocalizedText(
                    'ড্র্যাগ করে গুরুত্বপূর্ণ কাজ উপরে রাখুন।',
                  ),
                  const SizedBox(height: KSpacing.md),
                  Expanded(
                    child: ReorderableListView.builder(
                      itemCount: order.length,
                      onReorderItem: (oldIndex, newIndex) {
                        setSheetState(() {
                          final moved = order.removeAt(oldIndex);
                          order.insert(newIndex, moved);
                        });
                      },
                      itemBuilder: (context, index) {
                        final item = order[index];
                        return Card(
                          key: ValueKey(item.id),
                          child: ListTile(
                            leading: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: KNetworkImage(
                                url: item.imageUrl,
                                width: 52,
                                height: 52,
                              ),
                            ),
                            title: KLocalizedText(item.categoryName),
                            subtitle: item.caption?.isNotEmpty == true
                                ? Text(
                                    item.caption!,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  )
                                : const KLocalizedText(
                                    'ক্যাপশন নেই',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  tooltip: KaajLocalizations.text(
                                    context,
                                    'উপরে নিন',
                                  ),
                                  onPressed: index == 0
                                      ? null
                                      : () => setSheetState(() {
                                          final moved = order.removeAt(index);
                                          order.insert(index - 1, moved);
                                        }),
                                  icon: const Icon(Icons.arrow_upward),
                                ),
                                IconButton(
                                  tooltip: KaajLocalizations.text(
                                    context,
                                    'নিচে নিন',
                                  ),
                                  onPressed: index == order.length - 1
                                      ? null
                                      : () => setSheetState(() {
                                          final moved = order.removeAt(index);
                                          order.insert(index + 1, moved);
                                        }),
                                  icon: const Icon(Icons.arrow_downward),
                                ),
                                const Icon(Icons.drag_handle),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: KSpacing.md),
                  KPrimaryButton(
                    label: 'ক্রম সংরক্ষণ করুন',
                    onPressed: () => Navigator.pop(context, true),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (accepted != true || !mounted) return;
    setState(() => _reordering = true);
    try {
      await ref
          .read(trustSafetyRepositoryProvider)
          .reorderPortfolioItems(order.map((item) => item.id).toList());
      ref.invalidate(portfolioProvider);
      _snack('পোর্টফোলিওর ক্রম সংরক্ষণ হয়েছে।');
    } on Object catch (error) {
      if (mounted) _snack(_portfolioMessage(error));
    } finally {
      if (mounted) setState(() => _reordering = false);
    }
  }

  Future<void> _delete(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const KLocalizedText('এই কাজের ছবি মুছবেন?'),
        content: const KLocalizedText('ছবিটি স্থায়ীভাবে মুছে যাবে।'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const KLocalizedText('বাতিল'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const KLocalizedText('মুছুন'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busyIds.add(id));
    try {
      await ref.read(trustSafetyRepositoryProvider).deletePortfolioItem(id);
      ref.invalidate(portfolioProvider);
      _snack('কাজের নমুনাটি মুছে ফেলা হয়েছে।');
    } on Object catch (error) {
      if (mounted) _snack(_portfolioMessage(error));
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  void _showPreview(PortfolioItem item) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog.fullscreen(
        child: Scaffold(
          appBar: AppBar(title: KLocalizedText(item.categoryName)),
          body: Column(
            children: [
              Expanded(
                child: InteractiveViewer(
                  child: Center(
                    child: KNetworkImage(
                      url: item.imageUrl,
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
              ),
              if (item.caption?.isNotEmpty == true)
                Padding(
                  padding: const EdgeInsets.all(KSpacing.lg),
                  child: Text(item.caption!),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: KLocalizedText(message)));
  }
}

class _EmptyPortfolio extends StatelessWidget {
  const _EmptyPortfolio({required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(
        KSpacing.xl,
        KSpacing.xxl,
        KSpacing.xl,
        120,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.photo_library_outlined,
            size: 56,
            color: KColors.primary,
          ),
          const SizedBox(height: KSpacing.md),
          const KLocalizedText(
            'আপনার কাজ দেখান — বেশি কাজ পাবেন',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: KSpacing.sm),
          const KLocalizedText(
            'ছবি, ক্যাপশন ও কাজের ধরনসহ সর্বোচ্চ ২০টি নমুনা যোগ করুন।',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: KSpacing.lg),
          OutlinedButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add_photo_alternate_outlined),
            label: const KLocalizedText('প্রথম কাজটি যোগ করুন'),
          ),
        ],
      ),
    ),
  );
}

class _PortfolioSummary extends StatelessWidget {
  const _PortfolioSummary({
    required this.itemCount,
    required this.canReorder,
    required this.reordering,
    required this.onReorder,
  });

  final int itemCount;
  final bool canReorder;
  final bool reordering;
  final VoidCallback onReorder;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.md),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: KColors.primary.withValues(alpha: .1),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(
              Icons.collections_outlined,
              color: KColors.primary,
            ),
          ),
          const SizedBox(width: KSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                KLocalizedText(
                  '${_banglaNumber(itemCount)} / ২০টি কাজের নমুনা',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: KSpacing.xs),
                const KLocalizedText(
                  'পরিষ্কার ছবি ও সংক্ষিপ্ত বর্ণনা বেশি আস্থা তৈরি করে।',
                ),
              ],
            ),
          ),
          if (canReorder)
            IconButton(
              onPressed: reordering ? null : onReorder,
              tooltip: KaajLocalizations.text(context, 'ক্রম বদলান'),
              icon: reordering
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.reorder),
            ),
        ],
      ),
    ),
  );
}

class _PendingUploadCard extends StatelessWidget {
  const _PendingUploadCard({
    required this.draft,
    required this.progress,
    required this.uploading,
    required this.onCancel,
    required this.onRetry,
  });

  final _PortfolioDraft draft;
  final double progress;
  final bool uploading;
  final VoidCallback onCancel;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.memory(
                  draft.bytes,
                  width: 64,
                  height: 64,
                  fit: BoxFit.cover,
                ),
              ),
              const SizedBox(width: KSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    KLocalizedText(
                      uploading ? 'নিরাপদে আপলোড হচ্ছে' : 'আপলোড সম্পন্ন হয়নি',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    KLocalizedText(draft.categoryName),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: KSpacing.md),
          LinearProgressIndicator(value: uploading ? progress : 0),
          const SizedBox(height: KSpacing.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: onCancel,
                child: KLocalizedText(uploading ? 'বাতিল করুন' : 'বাদ দিন'),
              ),
              if (!uploading) ...[
                const SizedBox(width: KSpacing.sm),
                FilledButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const KLocalizedText('আবার চেষ্টা করুন'),
                ),
              ],
            ],
          ),
        ],
      ),
    ),
  );
}

class _PortfolioCard extends StatelessWidget {
  const _PortfolioCard({
    required this.item,
    required this.busy,
    required this.onOpen,
    required this.onEdit,
    required this.onDelete,
  });

  final PortfolioItem item;
  final bool busy;
  final VoidCallback onOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) => Card(
    clipBehavior: Clip.antiAlias,
    margin: EdgeInsets.zero,
    child: InkWell(
      onTap: busy ? null : onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                KNetworkImage(
                  url: item.imageUrl,
                  semanticLabel: KaajLocalizations.text(
                    context,
                    '${item.categoryName} কাজের ছবি',
                  ),
                ),
                if (busy)
                  const ColoredBox(
                    color: Color(0x66000000),
                    child: Center(child: CircularProgressIndicator()),
                  ),
              ],
            ),
          ),
          SizedBox(
            height: 52,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 44),
                  child: KLocalizedText(
                    item.categoryName,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: PopupMenuButton<_PortfolioAction>(
                    enabled: !busy,
                    tooltip: KaajLocalizations.text(
                      context,
                      'কাজের নমুনার অপশন',
                    ),
                    onSelected: (action) => switch (action) {
                      _PortfolioAction.edit => onEdit(),
                      _PortfolioAction.delete => onDelete(),
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                        value: _PortfolioAction.edit,
                        child: ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(Icons.edit_outlined),
                          title: KLocalizedText('তথ্য সম্পাদনা'),
                        ),
                      ),
                      PopupMenuItem(
                        value: _PortfolioAction.delete,
                        child: ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(
                            Icons.delete_outline,
                            color: KColors.danger,
                          ),
                          title: KLocalizedText('মুছুন'),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              KSpacing.sm,
              0,
              KSpacing.sm,
              KSpacing.sm,
            ),
            child: item.caption?.isNotEmpty == true
                ? Text(
                    item.caption!,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: KColors.textSecondary,
                    ),
                  )
                : KLocalizedText(
                    'ক্যাপশন যোগ করা হয়নি',
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: KColors.textSecondary.withValues(alpha: .75),
                    ),
                  ),
          ),
        ],
      ),
    ),
  );
}

class _PortfolioDetailsSheet extends StatefulWidget {
  const _PortfolioDetailsSheet({
    required this.categories,
    this.previewBytes,
    this.initialCategoryId,
    this.initialCaption,
    this.submitLabel = 'নিরাপদে আপলোড করুন',
  });

  final List<CatalogCategory> categories;
  final Uint8List? previewBytes;
  final String? initialCategoryId;
  final String? initialCaption;
  final String submitLabel;

  @override
  State<_PortfolioDetailsSheet> createState() => _PortfolioDetailsSheetState();
}

class _PortfolioDetailsSheetState extends State<_PortfolioDetailsSheet> {
  late final TextEditingController _caption;
  late String _categoryId;

  @override
  void initState() {
    super.initState();
    _caption = TextEditingController(text: widget.initialCaption);
    final ids = widget.categories.map((item) => item.id);
    _categoryId = ids.contains(widget.initialCategoryId)
        ? widget.initialCategoryId!
        : widget.categories.first.id;
  }

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        KSpacing.lg,
        0,
        KSpacing.lg,
        MediaQuery.viewInsetsOf(context).bottom + KSpacing.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          KLocalizedText(
            'কাজের তথ্য',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: KSpacing.sm),
          const KLocalizedText(
            'কাজের ধরন ও সংক্ষিপ্ত বর্ণনা গ্রাহককে সিদ্ধান্ত নিতে সাহায্য করে।',
          ),
          if (widget.previewBytes != null) ...[
            const SizedBox(height: KSpacing.md),
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.memory(
                widget.previewBytes!,
                height: 180,
                fit: BoxFit.cover,
              ),
            ),
          ],
          const SizedBox(height: KSpacing.md),
          DropdownButtonFormField<String>(
            initialValue: _categoryId,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: KaajLocalizations.text(context, 'কাজের ধরন'),
            ),
            items: widget.categories
                .map<DropdownMenuItem<String>>(
                  (item) => DropdownMenuItem(
                    value: item.id,
                    child: KLocalizedText(
                      item.nameFor(
                        Localizations.localeOf(context).languageCode,
                      ),
                    ),
                  ),
                )
                .toList(growable: false),
            onChanged: (value) => setState(() => _categoryId = value!),
          ),
          const SizedBox(height: KSpacing.md),
          TextField(
            controller: _caption,
            maxLength: 300,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: KaajLocalizations.text(context, 'ক্যাপশন (ঐচ্ছিক)'),
              hintText: KaajLocalizations.text(
                context,
                'কী কাজ করেছেন ও ফলাফল কী হয়েছে লিখুন',
              ),
            ),
          ),
          KPrimaryButton(
            label: widget.submitLabel,
            onPressed: () {
              final category = widget.categories.firstWhere(
                (item) => item.id == _categoryId,
              );
              Navigator.pop(
                context,
                _PortfolioDetails(
                  categoryId: _categoryId,
                  categoryName: category.nameFor(
                    Localizations.localeOf(context).languageCode,
                  ),
                  caption: _caption.text.trim(),
                ),
              );
            },
          ),
        ],
      ),
    ),
  );
}

class _PortfolioDetails {
  const _PortfolioDetails({
    required this.categoryId,
    required this.categoryName,
    required this.caption,
  });

  final String categoryId;
  final String categoryName;
  final String caption;
}

class _PortfolioDraft {
  const _PortfolioDraft({
    required this.bytes,
    required this.categoryId,
    required this.categoryName,
    required this.caption,
  });

  final Uint8List bytes;
  final String categoryId;
  final String categoryName;
  final String caption;
}

enum _PortfolioAction { edit, delete }

class _PortfolioLoading extends StatelessWidget {
  const _PortfolioLoading();

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    padding: const EdgeInsets.all(KSpacing.md),
    children: const [
      Card(
        child: SizedBox(
          height: 88,
          child: Center(child: CircularProgressIndicator()),
        ),
      ),
    ],
  );
}

bool _isSupportedImage(Uint8List bytes) {
  final jpeg =
      bytes.length >= 3 &&
      bytes[0] == 0xff &&
      bytes[1] == 0xd8 &&
      bytes[2] == 0xff;
  final png =
      bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4e &&
      bytes[3] == 0x47 &&
      bytes[4] == 0x0d &&
      bytes[5] == 0x0a &&
      bytes[6] == 0x1a &&
      bytes[7] == 0x0a;
  return jpeg || png;
}

String _portfolioMessage(Object error) {
  if (error is Failure) {
    final lower = error.message.toLowerCase();
    if (lower.contains('20 item') || lower.contains('at most 20')) {
      return 'সর্বোচ্চ ২০টি কাজের নমুনা রাখা যায়।';
    }
    if (lower.contains('network') || lower.contains('connection')) {
      return 'ইন্টারনেট সংযোগ পাওয়া যায়নি। সংযোগ ঠিক করে আবার চেষ্টা করুন।';
    }
    if (lower.contains('category')) {
      return 'কাজের ধরনটি আর ব্যবহারযোগ্য নয়। অন্য ধরন বেছে নিন।';
    }
  }
  return 'কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।';
}

String _banglaNumber(int value) => value
    .toString()
    .replaceAll('0', '০')
    .replaceAll('1', '১')
    .replaceAll('2', '২')
    .replaceAll('3', '৩')
    .replaceAll('4', '৪')
    .replaceAll('5', '৫')
    .replaceAll('6', '৬')
    .replaceAll('7', '৭')
    .replaceAll('8', '৮')
    .replaceAll('9', '৯');

String _message(Object error) =>
    error is Failure ? error.message : 'কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।';

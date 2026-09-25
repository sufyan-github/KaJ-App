import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/routing/route_arguments.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_localized_text.dart';
import '../../../../core/widgets/k_network_image.dart';
import '../../domain/chat_models.dart';
import '../controllers/chat_providers.dart';

class ChatListScreen extends ConsumerWidget {
  const ChatListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conversations = ref.watch(conversationsProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('বার্তা')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(conversationsProvider.future),
        child: conversations.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => ListView(
            children: [
              const SizedBox(height: 180),
              Center(
                child: FilledButton.icon(
                  onPressed: () => ref.invalidate(conversationsProvider),
                  icon: const Icon(Icons.refresh),
                  label: const KLocalizedText('আবার চেষ্টা করুন'),
                ),
              ),
            ],
          ),
          data: (items) => items.isEmpty
              ? ListView(
                  children: const [
                    SizedBox(height: 180),
                    Icon(Icons.forum_outlined, size: 56),
                    SizedBox(height: KSpacing.md),
                    Center(
                      child: KLocalizedText(
                        'কাজে আবেদন বা বুকিং হলে আলোচনা শুরু হবে।',
                      ),
                    ),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(KSpacing.md),
                  itemCount: items.length,
                  separatorBuilder: (_, _) =>
                      const SizedBox(height: KSpacing.sm),
                  itemBuilder: (context, index) =>
                      _ConversationCard(item: items[index]),
                ),
        ),
      ),
    );
  }
}

class _ConversationCard extends StatelessWidget {
  const _ConversationCard({required this.item});
  final ConversationSummary item;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: ListTile(
      contentPadding: const EdgeInsets.all(KSpacing.md),
      leading: CircleAvatar(
        child: Text(item.otherName.characters.firstOrNull ?? 'K'),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              item.otherName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (item.unreadCount > 0)
            Badge(label: KLocalizedText('${item.unreadCount}')),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 4),
          Text(
            item.jobTitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: KColors.primary),
          ),
          Text(
            _preview(context, item.lastMessage),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.push(
        AppRoutes.chatThread(item.id),
        extra: ChatThreadArgs(
          jobTitle: item.jobTitle,
          otherName: item.otherName,
          otherUserId: item.otherUserId,
        ),
      ),
    ),
  );
}

class ChatThreadScreen extends ConsumerStatefulWidget {
  const ChatThreadScreen({
    required this.conversationId,
    this.jobTitle,
    this.otherName,
    this.otherUserId,
    super.key,
  });

  final String conversationId;

  /// Absent when the thread was opened from a deep link rather than the list.
  final String? jobTitle;
  final String? otherName;
  final String? otherUserId;

  @override
  ConsumerState<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends ConsumerState<ChatThreadScreen> {
  final input = TextEditingController();
  final scroll = ScrollController();

  @override
  void dispose() {
    input.dispose();
    scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(chatThreadProvider(widget.conversationId));
    ref.listen(chatThreadProvider(widget.conversationId), (_, _) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
    });
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.otherName ??
                  KaajLocalizations.text(context, 'KAAJ ব্যবহারকারী'),
              style: const TextStyle(fontSize: 18),
            ),
            const KLocalizedText('আজ সক্রিয়', style: TextStyle(fontSize: 12)),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            onSelected: _menu,
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'report',
                child: KLocalizedText('রিপোর্ট করুন'),
              ),
              PopupMenuItem(
                value: 'block',
                child: KLocalizedText('ব্যবহারকারীকে ব্লক করুন'),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            color: KColors.surfaceAlt,
            padding: const EdgeInsets.symmetric(
              horizontal: KSpacing.md,
              vertical: KSpacing.sm,
            ),
            child: Row(
              children: [
                const Icon(Icons.work_outline, color: KColors.primary),
                const SizedBox(width: KSpacing.sm),
                Expanded(
                  child: Text(
                    widget.jobTitle ??
                        KaajLocalizations.text(context, 'কাজের আলোচনা'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            color: Colors.amber.shade50,
            padding: const EdgeInsets.all(KSpacing.sm),
            child: const Row(
              children: [
                Icon(Icons.shield_outlined, size: 20),
                SizedBox(width: KSpacing.sm),
                Expanded(
                  child: KLocalizedText(
                    'সুরক্ষিত থাকতে আলোচনা ও পেমেন্ট KAAJ-এর ভেতরে রাখুন।',
                  ),
                ),
              ],
            ),
          ),
          if (state.error != null)
            MaterialBanner(
              content: KLocalizedText(state.error!),
              actions: [
                TextButton(
                  onPressed: () =>
                      ScaffoldMessenger.of(context).hideCurrentMaterialBanner(),
                  child: const KLocalizedText('ঠিক আছে'),
                ),
              ],
            ),
          Expanded(
            child: state.loading
                ? const Center(child: CircularProgressIndicator())
                : state.messages.isEmpty
                ? const Center(
                    child: KLocalizedText('নিরাপদ আলোচনা শুরু করুন।'),
                  )
                : ListView.builder(
                    controller: scroll,
                    padding: const EdgeInsets.all(KSpacing.md),
                    itemCount: state.messages.length,
                    itemBuilder: (context, index) =>
                        _MessageBubble(message: state.messages[index]),
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                KSpacing.sm,
                KSpacing.xs,
                KSpacing.sm,
                KSpacing.sm,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  IconButton(
                    tooltip: KaajLocalizations.text(context, 'ছবি পাঠান'),
                    onPressed: state.sendingImage ? null : _pickImage,
                    icon: state.sendingImage
                        ? const SizedBox.square(
                            dimension: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.image_outlined),
                  ),
                  Expanded(
                    child: TextField(
                      controller: input,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 4000,
                      buildCounter:
                          (
                            _, {
                            required currentLength,
                            required isFocused,
                            maxLength,
                          }) => null,
                      decoration: InputDecoration(
                        hintText: KaajLocalizations.text(
                          context,
                          'বার্তা লিখুন',
                        ),
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: KSpacing.xs),
                  IconButton.filled(
                    tooltip: KaajLocalizations.text(context, 'পাঠান'),
                    onPressed: _send,
                    icon: const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _send() {
    final value = input.text;
    if (value.trim().isEmpty) return;
    input.clear();
    ref
        .read(chatThreadProvider(widget.conversationId).notifier)
        .sendText(value);
  }

  Future<void> _pickImage() async {
    final image = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (image == null) return;
    await ref
        .read(chatThreadProvider(widget.conversationId).notifier)
        .sendImage(await image.readAsBytes());
  }

  Future<void> _menu(String action) async {
    if (action == 'block' && widget.otherUserId != null) {
      try {
        await ref.read(chatRepositoryProvider).blockUser(widget.otherUserId!);
        if (mounted) context.pop();
      } on Object {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: KLocalizedText('ব্লক করা যায়নি। আবার চেষ্টা করুন।'),
            ),
          );
        }
      }
      return;
    }
    if (action == 'report') {
      if (mounted) {
        await context.push(
          AppRoutes.report('CONVERSATION', widget.conversationId),
        );
      }
    }
  }

  void _scrollToBottom() {
    if (scroll.hasClients) {
      scroll.animateTo(
        scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    }
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    if (message.type == 'SYSTEM') {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: KSpacing.sm),
        child: KLocalizedText(
          message.body ?? '',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      );
    }
    return Align(
      alignment: message.isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 310),
        margin: const EdgeInsets.only(bottom: KSpacing.sm),
        padding: const EdgeInsets.all(KSpacing.sm),
        decoration: BoxDecoration(
          color: message.isMine ? KColors.primary : KColors.surfaceAlt,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.attachmentUrl != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: KNetworkImage(
                  url: message.attachmentUrl!,
                  width: 240,
                  height: 180,
                ),
              ),
            if (message.body?.isNotEmpty == true) Text(message.body!),
            if (message.safetyWarning) ...[
              const SizedBox(height: KSpacing.xs),
              const KLocalizedText(
                'পেমেন্ট KAAJ-এ রাখুন—তাহলে সহায়তা ও সুরক্ষা পাবেন।',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ],
            if (message.isMine && message.delivery != ChatDelivery.sent)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: KLocalizedText(
                  message.delivery == ChatDelivery.sending
                      ? 'পাঠানো হচ্ছে…'
                      : 'পাঠানো যায়নি—সংযোগ হলে আবার চেষ্টা হবে',
                  style: const TextStyle(fontSize: 11),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String _preview(BuildContext context, ChatMessage? message) {
  if (message == null) {
    return KaajLocalizations.text(context, 'আলোচনা শুরু করুন');
  }
  if (message.type == 'IMAGE') {
    return '📷 ${KaajLocalizations.text(context, 'ছবি')}';
  }
  return message.body ?? KaajLocalizations.text(context, 'বার্তা');
}

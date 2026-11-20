import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/error_mapper.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/failure_copy.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/load_more.dart';
import '../../jobs/presentation/widgets/opportunity_listing.dart';
import '../domain/community_models.dart';
import 'community_providers.dart';

// ---------------------------------------------------------------------------
// Failure copy

/// Codes whose shared copy is worded for another module.
const _communityCodes = <String, String>{
  'IDENTITY_REQUIRED': 'দল শুরু করতে আগে পরিচয় (এনআইডি ও সেলফি) যাচাই করুন।',
  'GROUP_LIMIT_REACHED': 'আপনি সর্বোচ্চ ৫টি দল শুরু করতে পারেন।',
  'MENTOR_APPROVAL_REQUIRED':
      'সেশন আয়োজন করতে অনুমোদিত মেন্টর হতে হয়। মেন্টর পাতা থেকে আবেদন করুন।',
};

/// Copy for `SESSION_DETAILS_INVALID` by the field the server names.
const _sessionFields = <String, String>{
  'locationId': 'সরাসরি সেশনের জন্য এলাকা বেছে নিন।',
  'onlineLink': 'অনলাইন সেশনের জন্য https দিয়ে শুরু হওয়া লিঙ্ক দিন।',
  'pricePoisha': 'নগদ মূল্য শূন্যের বেশি লিখুন।',
  'priceModel': 'এটি শুধু নগদ মূল্যের সেশনে করা যায়।',
  'startsAt': 'শুরুর সময় অন্তত ১৫ মিনিট পরে হতে হবে।',
  'capacity': 'জায়গার সংখ্যা ঠিক নেই। নিশ্চিত মানুষের চেয়ে কম রাখা যায় না।',
  'capturedAt': 'চেক-ইন শুরুর এক ঘণ্টা আগে থেকে শেষ পর্যন্ত করা যায়।',
};

/// Like [failureText], with Community wording for a few codes. [codes]
/// lets one screen word a code for its own action (Bangla catalog keys).
String communityFailureText(
  BuildContext context,
  Object error,
  String fallback, {
  Map<String, String> codes = const {},
}) {
  final failure = ErrorMapper.from(error);
  final code = failure.code;
  final own =
      codes[code] ??
      _communityCodes[code] ??
      (code == 'SESSION_DETAILS_INVALID'
          ? _sessionFields[failure.field]
          : null);
  if (own != null) return KaajLocalizations.text(context, own);
  return failureText(context, error, fallback);
}

void showCommunityFailure(
  BuildContext context,
  Object error,
  String fallback, {
  Map<String, String> codes = const {},
}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(
          communityFailureText(context, error, fallback, codes: codes),
        ),
      ),
    );
}

void showCommunitySnack(BuildContext context, String message) =>
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: KLocalizedText(message)));

bool isNotFound(Object error) =>
    ErrorMapper.from(error).kind == FailureKind.notFound;

// ---------------------------------------------------------------------------
// Labels (Bangla catalog keys)

String introductionStatusLabel(String status) => switch (status) {
  'PENDING' => 'উত্তরের অপেক্ষায়',
  'ACCEPTED' => 'গ্রহণ করেছেন',
  'DECLINED' => 'প্রত্যাখ্যান করেছেন',
  'EXPIRED' => 'মেয়াদ শেষ',
  'WITHDRAWN' => 'প্রত্যাহার করা হয়েছে',
  _ => 'অবস্থা জানা নেই',
};

String contextLabel(IntroductionContext type) => switch (type) {
  IntroductionContext.idea => 'আইডিয়া',
  IntroductionContext.business => 'ব্যবসা',
  IntroductionContext.learningGoal => 'শেখার লক্ষ্য',
};

String sessionStatusLabel(String status) => switch (status) {
  'DRAFT' => 'খসড়া',
  'SCHEDULED' => 'নির্ধারিত',
  'CANCELLED' => 'বাতিল হয়েছে',
  'COMPLETED' => 'শেষ হয়েছে',
  _ => 'অবস্থা জানা নেই',
};

String participantStatusLabel(String status) => switch (status) {
  'INVITED' => 'আমন্ত্রিত',
  'ACCEPTED' => 'নিশ্চিত',
  'DECLINED' => 'যাচ্ছেন না',
  'ATTENDED' => 'উপস্থিত ছিলেন',
  'NO_SHOW' => 'আসেননি',
  'WAITLISTED' => 'অপেক্ষা তালিকায়',
  _ => 'অবস্থা জানা নেই',
};

String sessionKindLabel(SessionKind kind) => switch (kind) {
  SessionKind.consultation => 'বিশেষজ্ঞের পরামর্শ',
  SessionKind.groupDiscussion => 'দলগত আলোচনা',
  SessionKind.workshop => 'কর্মশালা',
  SessionKind.event => 'অনুষ্ঠান',
};

String sessionModeLabel(SessionMode mode) => switch (mode) {
  SessionMode.inPerson => 'সরাসরি দেখা',
  SessionMode.online => 'অনলাইন ভিডিও',
  SessionMode.inAppChat => 'অ্যাপের চ্যাটে',
};

String groupRoleLabel(String role) => switch (role) {
  'MODERATOR' => 'মডারেটর',
  'AMBASSADOR' => 'কমিউনিটি অ্যাম্বাসেডর',
  _ => 'সদস্য',
};

/// A small coloured label.
class StatusPill extends StatelessWidget {
  const StatusPill(this.label, {this.color = KColors.info, super.key});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: KSpacing.sm, vertical: 2),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(KRadius.pill),
    ),
    child: KLocalizedText(
      label,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
        color: color,
        fontWeight: FontWeight.w600,
      ),
    ),
  );
}

Color statusColor(String status) => switch (status) {
  'PENDING' || 'DRAFT' || 'INVITED' || 'WAITLISTED' => KColors.warning,
  'ACCEPTED' || 'SCHEDULED' || 'ATTENDED' || 'ACTIVE' => KColors.success,
  'DECLINED' || 'CANCELLED' || 'NO_SHOW' || 'EXPIRED' => KColors.danger,
  _ => KColors.info,
};

/// A label and value row in a detail card.
class InfoRow extends StatelessWidget {
  const InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    super.key,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: KSpacing.xs),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: KColors.textSecondary),
        const SizedBox(width: KSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              KLocalizedText(
                label,
                style: Theme.of(context).textTheme.labelMedium,
              ),
              Text(value),
            ],
          ),
        ),
      ],
    ),
  );
}

// ---------------------------------------------------------------------------
// Async states

/// Shown when the server says 404: deleted, private or blocked.
class NotAvailableState extends StatelessWidget {
  const NotAvailableState({super.key});

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    padding: const EdgeInsets.all(KSpacing.md),
    children: const [
      KEmptyState(
        icon: Icons.visibility_off_outlined,
        title: 'এটি দেখা যাচ্ছে না',
        message: 'এটি মুছে ফেলা হয়েছে, ব্যক্তিগত, অথবা আপনার জন্য খোলা নেই।',
      ),
    ],
  );
}

/// Loading, a 404 state, an error with retry, or the data.
class CommunityAsync<T> extends StatelessWidget {
  const CommunityAsync({
    required this.value,
    required this.errorLabel,
    required this.onRetry,
    required this.builder,
    super.key,
  });

  final Widget Function(T data) builder;
  final String errorLabel;
  final VoidCallback onRetry;
  final AsyncValue<T> value;

  @override
  Widget build(BuildContext context) => value.when(
    skipLoadingOnRefresh: true,
    skipLoadingOnReload: true,
    loading: () => const Center(child: CircularProgressIndicator()),
    error: (error, _) => isNotFound(error)
        ? const NotAvailableState()
        : RetryPanel(error: error, label: errorLabel, onRetry: onRetry),
    data: builder,
  );
}

/// A server list with pull to refresh, an empty state and "show more".
class CommunityPagedList<T> extends ConsumerStatefulWidget {
  const CommunityPagedList({
    required this.provider,
    required this.fetchMore,
    required this.itemBuilder,
    required this.errorLabel,
    required this.empty,
    this.header = const [],
    this.filter,
    this.loadMoreKey = const ValueKey('community-load-more'),
    super.key,
  });

  final KEmptyState empty;
  final String errorLabel;
  final Future<List<T>> Function(String cursor) fetchMore;
  final bool Function(T item)? filter;
  final List<Widget> header;
  final Widget Function(BuildContext context, T item) itemBuilder;
  final Key loadMoreKey;
  final AutoDisposeFutureProvider<List<T>> provider;

  @override
  ConsumerState<CommunityPagedList<T>> createState() =>
      _CommunityPagedListState<T>();
}

class _CommunityPagedListState<T> extends ConsumerState<CommunityPagedList<T>> {
  final _more = MorePages<T>();

  Future<void> _refresh() async {
    ref.invalidate(widget.provider);
    await ref.read(widget.provider.future).then<void>((_) {}, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(widget.provider);
    return value.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            ...widget.header,
            const SizedBox(height: KSpacing.xl),
            RetryPanel(
              error: error,
              label: widget.errorLabel,
              onRetry: () => ref.invalidate(widget.provider),
            ),
          ],
        ),
      ),
      data: (firstPage) {
        final all = _more.merge(firstPage);
        final hasMore = _more.hasMore;
        final filter = widget.filter;
        final items = filter == null
            ? all
            : all.where(filter).toList(growable: false);
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: KSpacing.lg),
            children: [
              ...widget.header,
              if (items.isEmpty && !hasMore)
                all.isNotEmpty
                    ? const Padding(
                        padding: EdgeInsets.all(KSpacing.xl),
                        child: Center(
                          child: KLocalizedText('খোঁজার সঙ্গে কিছু মেলেনি।'),
                        ),
                      )
                    : widget.empty,
              for (final item in items)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: KSpacing.md,
                    vertical: KSpacing.xs,
                  ),
                  child: widget.itemBuilder(context, item),
                ),
              if (hasMore)
                LoadMoreButton(
                  key: widget.loadMoreKey,
                  loading: _more.loading,
                  failed: _more.failed,
                  onPressed: () => _more.loadNext(widget.fetchMore, () {
                    if (mounted) setState(() {});
                  }),
                ),
            ],
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Dialogs

Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
}) async {
  final answer = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: KLocalizedText(title),
      content: KLocalizedText(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const KLocalizedText('ফিরে যান'),
        ),
        FilledButton(
          key: const ValueKey('confirm-action'),
          onPressed: () => Navigator.pop(context, true),
          child: KLocalizedText(confirmLabel),
        ),
      ],
    ),
  );
  return answer == true;
}

/// Asks for a short text such as a reason. Returns null when dismissed.
Future<String?> askText(
  BuildContext context, {
  required String title,
  required String label,
  required String confirmLabel,
  int minLength = 0,
  int maxLength = 300,
  String? hint,
  TextInputType? keyboardType,
}) => showDialog<String>(
  context: context,
  builder: (context) => _TextDialog(
    title: title,
    label: label,
    confirmLabel: confirmLabel,
    minLength: minLength,
    maxLength: maxLength,
    hint: hint,
    keyboardType: keyboardType,
  ),
);

class _TextDialog extends StatefulWidget {
  const _TextDialog({
    required this.title,
    required this.label,
    required this.confirmLabel,
    required this.minLength,
    required this.maxLength,
    this.hint,
    this.keyboardType,
  });

  final String confirmLabel;
  final String? hint;
  final TextInputType? keyboardType;
  final String label;
  final int maxLength;
  final int minLength;
  final String title;

  @override
  State<_TextDialog> createState() => _TextDialogState();
}

class _TextDialogState extends State<_TextDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final length = _controller.text.trim().length;
    final ok = length >= widget.minLength && length <= widget.maxLength;
    return AlertDialog(
      title: KLocalizedText(widget.title),
      content: TextField(
        key: const ValueKey('dialog-text'),
        controller: _controller,
        maxLength: widget.maxLength,
        minLines: widget.keyboardType == TextInputType.number ? 1 : 2,
        maxLines: widget.keyboardType == TextInputType.number ? 1 : 4,
        keyboardType: widget.keyboardType,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
          labelText: KaajLocalizations.text(context, widget.label),
          hintText: widget.hint == null
              ? null
              : KaajLocalizations.text(context, widget.hint!),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const KLocalizedText('ফিরে যান'),
        ),
        FilledButton(
          key: const ValueKey('dialog-confirm'),
          onPressed: ok
              ? () => Navigator.pop(context, _controller.text.trim())
              : null,
          child: KLocalizedText(widget.confirmLabel),
        ),
      ],
    );
  }
}

/// Picks up to 50 people from the worker directory. Returns their user
/// ids, or null when dismissed.
Future<List<String>?> showPeoplePicker(
  BuildContext context, {
  Set<String> exclude = const {},
}) => showModalBottomSheet<List<String>>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => _PeoplePicker(exclude: exclude),
);

class _PeoplePicker extends ConsumerStatefulWidget {
  const _PeoplePicker({required this.exclude});

  final Set<String> exclude;

  @override
  ConsumerState<_PeoplePicker> createState() => _PeoplePickerState();
}

class _PeoplePickerState extends ConsumerState<_PeoplePicker> {
  final _chosen = <String>{};
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final people = ref.watch(peopleDirectoryProvider);
    final language = Localizations.localeOf(context).languageCode;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.8,
      maxChildSize: 0.95,
      builder: (context, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: KSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                KLocalizedText(
                  'মানুষ বেছে নিন',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const KLocalizedText(
                  'একবারে সর্বোচ্চ ৫০ জন। যাঁরা যোগ দিতে পারবেন না তাঁদের সার্ভার বাদ দেবে।',
                ),
                const SizedBox(height: KSpacing.sm),
                TextField(
                  key: const ValueKey('people-search'),
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: KaajLocalizations.text(context, 'নাম লিখুন'),
                  ),
                  onChanged: (value) => setState(() => _query = value),
                ),
              ],
            ),
          ),
          Expanded(
            child: people.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => RetryPanel(
                error: error,
                label: 'মানুষের তালিকা লোড করা যায়নি।',
                onRetry: () => ref.invalidate(peopleDirectoryProvider),
              ),
              data: (all) {
                final items = all
                    .where((person) => !widget.exclude.contains(person.userId))
                    .where(
                      (person) => matchesSearch(_query, [
                        person.displayName,
                        person.area?.nameBn,
                        person.area?.nameEn,
                      ]),
                    )
                    .toList(growable: false);
                if (items.isEmpty) {
                  return const Center(
                    child: KLocalizedText('কাউকে পাওয়া যায়নি।'),
                  );
                }
                return ListView(
                  controller: controller,
                  children: [
                    for (final person in items)
                      CheckboxListTile(
                        key: ValueKey('person-${person.userId}'),
                        value: _chosen.contains(person.userId),
                        title: Text(person.displayName),
                        subtitle: person.area == null
                            ? null
                            : Text(person.area!.nameFor(language)),
                        onChanged: (on) => setState(() {
                          if (on == true && _chosen.length < 50) {
                            _chosen.add(person.userId);
                          } else {
                            _chosen.remove(person.userId);
                          }
                        }),
                      ),
                  ],
                );
              },
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(KSpacing.md),
              child: FilledButton(
                key: const ValueKey('people-confirm'),
                onPressed: _chosen.isEmpty
                    ? null
                    : () => Navigator.pop(
                        context,
                        _chosen.toList(growable: false),
                      ),
                child: const KLocalizedText('আমন্ত্রণ পাঠান'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

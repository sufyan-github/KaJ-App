import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../business_routes.dart';
import '../domain/business_models.dart';
import 'business_providers.dart';
import 'business_widgets.dart';

/// The businesses the person owns or works in, and invitations to join.
class MyBusinessesScreen extends StatelessWidget {
  const MyBusinessesScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const KLocalizedText('আমার ব্যবসা')),
    floatingActionButton: FloatingActionButton.extended(
      key: const ValueKey('business-create'),
      onPressed: () => context.push(BusinessRoutes.create),
      icon: const Icon(Icons.add_business_outlined),
      label: const KLocalizedText('ব্যবসা তৈরি করুন'),
    ),
    body: const MyBusinessesBody(),
  );
}

/// The list of businesses and invitations, with pull to refresh. [header]
/// goes above it (My activity adds its links there).
class MyBusinessesBody extends ConsumerStatefulWidget {
  const MyBusinessesBody({this.header = const [], super.key});

  final List<Widget> header;

  @override
  ConsumerState<MyBusinessesBody> createState() => _MyBusinessesBodyState();
}

class _MyBusinessesBodyState extends ConsumerState<MyBusinessesBody> {
  final _busy = <String>{};

  Future<void> _refresh() async {
    ref.invalidate(myBusinessesProvider);
    await ref
        .read(myBusinessesProvider.future)
        .then<void>((_) {}, onError: (_) {});
  }

  Future<void> _answer(BusinessInvitation invitation, bool accept) async {
    final id = invitation.business.id;
    if (_busy.contains(id)) return;
    setState(() => _busy.add(id));
    final repository = ref.read(businessRepositoryProvider);
    try {
      if (accept) {
        await repository.acceptInvitation(id);
      } else {
        await repository.leave(id);
      }
      ref.invalidate(myBusinessesProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: KLocalizedText(
              accept
                  ? 'আপনি এখন এই ব্যবসার সদস্য।'
                  : 'আমন্ত্রণ ফিরিয়ে দেওয়া হয়েছে।',
            ),
          ),
        );
      }
    } on Object catch (error) {
      if (mounted) {
        showFailureSnack(
          context,
          error,
          accept
              ? 'আমন্ত্রণ গ্রহণ করা যায়নি।'
              : 'আমন্ত্রণ ফিরিয়ে দেওয়া যায়নি।',
        );
      }
    } finally {
      if (mounted) setState(() => _busy.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final mine = ref.watch(myBusinessesProvider);
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          KSpacing.md,
          KSpacing.sm,
          KSpacing.md,
          KSpacing.xxl * 2,
        ),
        children: [
          ...widget.header,
          ...mine.when(
            loading: () => const [
              Padding(
                padding: EdgeInsets.all(KSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              ),
            ],
            error: (error, _) => [
              SizedBox(
                height: 360,
                child: BusinessLoadError(
                  error: error,
                  label: 'আপনার ব্যবসার তালিকা লোড করা যায়নি।',
                  onRetry: () => ref.invalidate(myBusinessesProvider),
                ),
              ),
            ],
            data: (data) => [
              if (data.invitations.isNotEmpty) ...[
                const BusinessSectionTitle('আমন্ত্রণ'),
                for (final invitation in data.invitations)
                  _InvitationCard(
                    invitation: invitation,
                    busy: _busy.contains(invitation.business.id),
                    onAccept: () => _answer(invitation, true),
                    onDecline: () => _answer(invitation, false),
                  ),
              ],
              if (data.items.isEmpty && data.invitations.isEmpty)
                KEmptyState(
                  icon: Icons.storefront_outlined,
                  title: 'এখনো কোনো ব্যবসা নেই',
                  message:
                      'আপনার ব্যবসা যোগ করুন, অংশীদার খুঁজুন এবং কর্মী নিয়োগ দিন। ব্যবসা অংশ বিনামূল্যে।',
                  actionLabel: 'ব্যবসা তৈরি করুন',
                  onAction: () => context.push(BusinessRoutes.create),
                )
              else if (data.items.isNotEmpty) ...[
                const BusinessSectionTitle('আমার ব্যবসাগুলো'),
                for (final business in data.items)
                  BusinessCard(
                    business: business,
                    onTap: () async {
                      await context.push(BusinessRoutes.detail(business.id));
                      ref.invalidate(myBusinessesProvider);
                    },
                  ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _InvitationCard extends StatelessWidget {
  const _InvitationCard({
    required this.invitation,
    required this.busy,
    required this.onAccept,
    required this.onDecline,
  });

  final BusinessInvitation invitation;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) => Card(
    key: ValueKey('invitation-${invitation.business.id}'),
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            invitation.business.name,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: KSpacing.xs),
          Wrap(
            spacing: KSpacing.xs,
            runSpacing: KSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const KLocalizedText('আপনাকে যোগ দিতে আমন্ত্রণ জানানো হয়েছে:'),
              BusinessPill(businessRoleLabel(invitation.role)),
            ],
          ),
          const SizedBox(height: KSpacing.sm),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  key: ValueKey('invitation-decline-${invitation.business.id}'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 44),
                  ),
                  onPressed: busy ? null : onDecline,
                  child: const KLocalizedText('ফিরিয়ে দিন'),
                ),
              ),
              const SizedBox(width: KSpacing.sm),
              Expanded(
                child: FilledButton(
                  key: ValueKey('invitation-accept-${invitation.business.id}'),
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                  onPressed: busy ? null : onAccept,
                  child: busy
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const KLocalizedText('গ্রহণ করুন'),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure_copy.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../ai/presentation/ai_entry_tiles.dart';
import '../../jobs/presentation/screens/jobs_screens.dart';
import '../business_routes.dart';
import '../domain/business_models.dart';
import 'business_providers.dart';
import 'business_widgets.dart';

/// One business. Anyone sees the public part of a public business; its
/// members also see contact details and manage it.
class BusinessDetailScreen extends ConsumerStatefulWidget {
  const BusinessDetailScreen({required this.businessId, super.key});

  final String businessId;

  @override
  ConsumerState<BusinessDetailScreen> createState() =>
      _BusinessDetailScreenState();
}

class _BusinessDetailScreenState extends ConsumerState<BusinessDetailScreen> {
  bool _busy = false;

  String get _id => widget.businessId;

  Future<void> _refresh() async {
    ref
      ..invalidate(businessDetailProvider(_id))
      ..invalidate(businessOfferingsProvider(_id))
      ..invalidate(businessJobsProvider(_id));
    await ref
        .read(businessDetailProvider(_id).future)
        .then<void>((_) {}, onError: (_) {});
  }

  Future<void> _edit() async {
    final result = await context.push<Object?>(BusinessRoutes.edit(_id));
    if (!mounted) return;
    if (result == 'deleted') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: KLocalizedText('ব্যবসাটি মুছে ফেলা হয়েছে।')),
      );
      context.pop();
      return;
    }
    ref.invalidate(businessDetailProvider(_id));
  }

  Future<void> _run(
    Future<void> Function() action,
    String failure, {
    String? done,
    bool leaveScreen = false,
  }) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      ref
        ..invalidate(myBusinessesProvider)
        ..invalidate(businessDetailProvider(_id));
      if (!mounted) return;
      if (done != null) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: KLocalizedText(done)));
      }
      if (leaveScreen) context.pop();
    } on Object catch (error) {
      if (mounted) showFailureSnack(context, error, failure);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _leave(Business business) async {
    final confirmed = await confirmBusinessAction(
      context,
      title: 'ব্যবসা ছেড়ে দেবেন?',
      message: 'আপনি আর এই ব্যবসার সদস্য থাকবেন না।',
      confirm: 'ছেড়ে দিন',
    );
    if (!confirmed) return;
    await _run(
      () => ref.read(businessRepositoryProvider).leave(business.id),
      'ব্যবসা ছেড়ে দেওয়া যায়নি।',
      done: 'আপনি ব্যবসাটি ছেড়ে দিয়েছেন।',
      leaveScreen: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final business = ref.watch(businessDetailProvider(_id));
    final loaded = business.valueOrNull;
    return Scaffold(
      appBar: AppBar(
        title: Text(loaded?.name ?? KaajLocalizations.text(context, 'ব্যবসা')),
        actions: [
          if (loaded != null && loaded.canEdit)
            IconButton(
              key: const ValueKey('business-edit'),
              tooltip: KaajLocalizations.text(context, 'তথ্য বদলান'),
              onPressed: _edit,
              icon: const Icon(Icons.edit_outlined),
            ),
          if (loaded != null && !loaded.isMember)
            IconButton(
              key: const ValueKey('business-report'),
              tooltip: KaajLocalizations.text(context, 'রিপোর্ট করুন'),
              onPressed: () =>
                  context.push(AppRoutes.report('BUSINESS', loaded.id)),
              icon: const Icon(Icons.flag_outlined),
            ),
        ],
      ),
      body: business.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => RefreshIndicator(
          onRefresh: _refresh,
          child: BusinessLoadError(
            error: error,
            label: 'ব্যবসার তথ্য লোড করা যায়নি।',
            onRetry: () => ref.invalidate(businessDetailProvider(_id)),
          ),
        ),
        data: (business) => RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              KSpacing.md,
              KSpacing.sm,
              KSpacing.md,
              KSpacing.xl,
            ),
            children: [
              if (business.isMember) ..._memberBanners(business),
              _Header(business: business),
              if (business.isMember) _MemberInfo(business: business),
              if (business.isMember)
                _MemberActions(
                  business: business,
                  busy: _busy,
                  onEdit: _edit,
                  onLeave: () => _leave(business),
                )
              else
                _VisitorActions(business: business),
              _OfferingsPreview(business: business),
              _JobsSection(business: business),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _memberBanners(Business business) {
    final invited =
        ref.watch(myBusinessesProvider).valueOrNull?.isInvitedTo(business.id) ??
        false;
    return [
      if (business.isSuspended)
        const _Banner(
          key: ValueKey('business-suspended'),
          color: KColors.danger,
          icon: Icons.block,
          text:
              'KAAJ এই ব্যবসাটি স্থগিত করেছে। এটি অন্যরা দেখতে পান না এবং এখন কিছু বদলানো যাবে না। জানতে সহায়তায় যোগাযোগ করুন।',
        ),
      if (invited)
        Card(
          key: const ValueKey('business-invited'),
          color: KColors.surfaceAlt,
          child: Padding(
            padding: const EdgeInsets.all(KSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const KLocalizedText(
                  'আপনাকে এই ব্যবসায় যোগ দিতে আমন্ত্রণ জানানো হয়েছে।',
                ),
                const SizedBox(height: KSpacing.sm),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 44),
                        ),
                        onPressed: _busy
                            ? null
                            : () => _run(
                                () => ref
                                    .read(businessRepositoryProvider)
                                    .leave(business.id),
                                'আমন্ত্রণ ফিরিয়ে দেওয়া যায়নি।',
                                done: 'আমন্ত্রণ ফিরিয়ে দেওয়া হয়েছে।',
                                leaveScreen: true,
                              ),
                        child: const KLocalizedText('ফিরিয়ে দিন'),
                      ),
                    ),
                    const SizedBox(width: KSpacing.sm),
                    Expanded(
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(0, 44),
                        ),
                        onPressed: _busy
                            ? null
                            : () => _run(
                                () => ref
                                    .read(businessRepositoryProvider)
                                    .acceptInvitation(business.id),
                                'আমন্ত্রণ গ্রহণ করা যায়নি।',
                                done: 'আপনি এখন এই ব্যবসার সদস্য।',
                              ),
                        child: const KLocalizedText('গ্রহণ করুন'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
    ];
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.color,
    required this.icon,
    required this.text,
    super.key,
  });

  final Color color;
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Card(
    color: color.withValues(alpha: .12),
    child: Padding(
      padding: const EdgeInsets.all(KSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color),
          const SizedBox(width: KSpacing.sm),
          Expanded(child: KLocalizedText(text)),
        ],
      ),
    ),
  );
}

class _Header extends StatelessWidget {
  const _Header({required this.business});

  final Business business;

  @override
  Widget build(BuildContext context) {
    final language = Localizations.localeOf(context).languageCode;
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(business.name, style: theme.textTheme.headlineSmall),
            const SizedBox(height: KSpacing.xs),
            Wrap(
              spacing: KSpacing.sm,
              runSpacing: KSpacing.xs,
              children: [
                BusinessPill(businessStageText(context, business)),
                if (business.verified) const BusinessVerifiedBadge(),
                if (business.myRole != null)
                  BusinessPill(
                    businessRoleLabel(business.myRole),
                    color: KColors.success,
                  ),
                if (business.seekingPartners)
                  const BusinessPill('অংশীদার খুঁজছে', color: KColors.success),
              ],
            ),
            const SizedBox(height: KSpacing.sm),
            if (business.category != null)
              _InfoRow(
                icon: Icons.category_outlined,
                label: 'খাত',
                value: business.category!.nameFor(language),
              ),
            if (business.area != null)
              _InfoRow(
                icon: Icons.place_outlined,
                label: 'এলাকা',
                value: business.area!.nameFor(language),
              ),
            if (business.owner != null &&
                business.owner!.displayName.isNotEmpty)
              _InfoRow(
                icon: Icons.person_outline,
                label: 'মালিক',
                value: business.owner!.displayName,
              ),
            if (business.employeesCount != null)
              _InfoRow(
                icon: Icons.groups_outlined,
                label: 'কর্মীর সংখ্যা',
                value: KFormat.count(context, business.employeesCount!),
              ),
            if (business.description != null) ...[
              const SizedBox(height: KSpacing.sm),
              Text(business.description!),
            ],
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: KSpacing.xs / 2),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: KColors.textSecondary),
        const SizedBox(width: KSpacing.sm),
        KLocalizedText(label, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(width: KSpacing.sm),
        Expanded(child: Text(value)),
      ],
    ),
  );
}

class _MemberInfo extends StatelessWidget {
  const _MemberInfo({required this.business});

  final Business business;

  @override
  Widget build(BuildContext context) {
    final rows = [
      if (business.contactPerson != null)
        _InfoRow(
          icon: Icons.contact_phone_outlined,
          label: 'যোগাযোগ',
          value: business.contactPerson!,
        ),
      if (business.address != null)
        _InfoRow(
          icon: Icons.home_work_outlined,
          label: 'ঠিকানা',
          value: business.address!,
        ),
      if (business.tradeLicenceNo != null)
        _InfoRow(
          icon: Icons.description_outlined,
          label: 'ট্রেড লাইসেন্স',
          value: business.tradeLicenceNo!,
        ),
      _InfoRow(
        icon: business.isPublic ? Icons.public : Icons.lock_outline,
        label: 'দৃশ্যমানতা',
        value: KaajLocalizations.text(
          context,
          business.isPublic ? 'সবাই দেখতে পান' : 'শুধু সদস্যরা দেখেন',
        ),
      ),
    ];
    return Card(
      key: const ValueKey('business-member-info'),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(children: rows),
      ),
    );
  }
}

class _MemberActions extends StatelessWidget {
  const _MemberActions({
    required this.business,
    required this.busy,
    required this.onEdit,
    required this.onLeave,
  });

  final Business business;
  final bool busy;
  final VoidCallback onEdit;
  final VoidCallback onLeave;

  @override
  Widget build(BuildContext context) => Card(
    child: Column(
      children: [
        if (business.canEdit)
          ListTile(
            leading: const Icon(Icons.edit_outlined),
            title: const KLocalizedText('তথ্য বদলান'),
            trailing: const Icon(Icons.chevron_right),
            onTap: onEdit,
          ),
        ListTile(
          key: const ValueKey('business-members'),
          leading: const Icon(Icons.groups_outlined),
          title: const KLocalizedText('সদস্য'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push(BusinessRoutes.members(business.id)),
        ),
        ListTile(
          key: const ValueKey('business-offerings'),
          leading: const Icon(Icons.inventory_2_outlined),
          title: const KLocalizedText('পণ্য ও সেবা'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push(BusinessRoutes.offerings(business.id)),
        ),
        if (business.isOwner)
          ListTile(
            key: const ValueKey('business-verification'),
            leading: Icon(
              business.verified ? Icons.verified : Icons.verified_outlined,
              color: business.verified ? KColors.success : null,
            ),
            title: const KLocalizedText('ব্যবসা যাচাই'),
            subtitle: KLocalizedText(
              _verificationLabel(business.verificationStatus),
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(BusinessRoutes.verification(business.id)),
          ),
        AiGrowthTipsTile(businessId: business.id),
        ListTile(
          key: const ValueKey('business-leave'),
          leading: const Icon(Icons.logout, color: KColors.danger),
          title: const KLocalizedText('ব্যবসা ছেড়ে দিন'),
          enabled: !busy,
          onTap: onLeave,
        ),
      ],
    ),
  );
}

String _verificationLabel(String? status) => switch (status) {
  'PENDING' => 'পর্যালোচনাধীন',
  'APPROVED' => 'যাচাই সম্পন্ন',
  'REJECTED' => 'সংশোধন প্রয়োজন',
  _ => 'জমা দেওয়া হয়নি',
};

class _VisitorActions extends StatelessWidget {
  const _VisitorActions({required this.business});

  final Business business;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: KSpacing.sm),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (business.seekingPartners || business.isPublic)
          FilledButton.icon(
            key: const ValueKey('business-collaborate'),
            onPressed: () =>
                context.push(BusinessRoutes.collaborate(business.id)),
            icon: const Icon(Icons.handshake_outlined),
            label: const KLocalizedText('সহযোগিতার অনুরোধ পাঠান'),
          ),
        const SizedBox(height: KSpacing.sm),
        OutlinedButton.icon(
          onPressed: () =>
              context.push(AppRoutes.report('BUSINESS', business.id)),
          icon: const Icon(Icons.flag_outlined),
          label: const KLocalizedText('ব্যবসাটি রিপোর্ট করুন'),
        ),
      ],
    ),
  );
}

class _OfferingsPreview extends ConsumerWidget {
  const _OfferingsPreview({required this.business});

  final Business business;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offerings = ref.watch(businessOfferingsProvider(business.id));
    final language = Localizations.localeOf(context).languageCode;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        BusinessSectionTitle(
          'পণ্য ও সেবা',
          trailing: TextButton(
            onPressed: () =>
                context.push(BusinessRoutes.offerings(business.id)),
            child: KLocalizedText(
              business.canEdit ? 'পরিচালনা করুন' : 'সব দেখুন',
            ),
          ),
        ),
        offerings.when(
          loading: () => const LinearProgressIndicator(),
          error: (error, _) =>
              Text(failureText(context, error, 'পণ্য ও সেবা লোড করা যায়নি।')),
          data: (items) {
            final visible = items
                .where((item) => item.isActive && !item.isHidden)
                .take(5)
                .toList();
            if (visible.isEmpty) {
              return const KLocalizedText(
                'এখনো কোনো পণ্য বা সেবা যোগ করা হয়নি।',
              );
            }
            return Card(
              child: Column(
                children: [
                  for (final item in visible)
                    ListTile(
                      leading: Icon(
                        item.kind == OfferingKind.service
                            ? Icons.handyman_outlined
                            : Icons.inventory_2_outlined,
                      ),
                      title: Text(item.titleFor(language)),
                      subtitle: offeringPriceText(context, item) == null
                          ? null
                          : Text(offeringPriceText(context, item)!),
                    ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

/// "৳500 – ৳800 / প্রতি কেজি", or null without a price.
String? offeringPriceText(BuildContext context, Offering offering) {
  final range = KFormat.moneyRange(
    context,
    offering.priceMin,
    offering.priceMax,
  );
  if (range == null) return null;
  return offering.priceUnit == null ? range : '$range / ${offering.priceUnit}';
}

class _JobsSection extends ConsumerWidget {
  const _JobsSection({required this.business});

  final Business business;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final jobs = ref.watch(businessJobsProvider(business.id));
    final language = Localizations.localeOf(context).languageCode;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        BusinessSectionTitle(business.isMember ? 'এই ব্যবসার কাজ' : 'খোলা কাজ'),
        if (business.canEdit && !business.isSuspended)
          Padding(
            padding: const EdgeInsets.only(bottom: KSpacing.sm),
            child: OutlinedButton.icon(
              key: const ValueKey('business-post-job'),
              onPressed: () async {
                await context.push(BusinessRoutes.staffJob(business.id));
                ref.invalidate(businessJobsProvider(business.id));
              },
              icon: const Icon(Icons.post_add),
              label: const KLocalizedText('কর্মী নিয়োগের কাজ পোস্ট করুন'),
            ),
          ),
        jobs.when(
          loading: () => const LinearProgressIndicator(),
          error: (error, _) =>
              Text(failureText(context, error, 'কাজের তালিকা লোড করা যায়নি।')),
          data: (items) => items.isEmpty
              ? const KLocalizedText('এখন কোনো কাজ নেই।')
              : Card(
                  child: Column(
                    children: [
                      for (final job in items)
                        ListTile(
                          key: ValueKey('business-job-${job.id}'),
                          leading: const Icon(Icons.work_outline),
                          title: Text(job.title),
                          subtitle: Text(
                            [
                              KaajLocalizations.text(
                                context,
                                jobStatusLabel(job.status),
                              ),
                              ?KFormat.moneyRange(
                                context,
                                job.budgetMin,
                                job.budgetMax,
                              ),
                              ?job.location?.nameFor(language),
                            ].join(' · '),
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () =>
                              context.push(AppRoutes.jobDetail(job.id)),
                        ),
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

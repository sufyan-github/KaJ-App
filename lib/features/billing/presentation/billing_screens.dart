import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/failure.dart';
import '../../../core/formatting/kaaj_format.dart';
import '../../../core/localization/kaaj_localizations.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_card.dart';
import '../../../core/widgets/k_empty_state.dart';
import '../../../core/widgets/k_error_message.dart';
import '../../../core/widgets/k_error_state.dart';
import '../../../core/widgets/k_localized_text.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../auth/presentation/controllers/auth_controller.dart';
import '../../auth/presentation/controllers/auth_providers.dart';
import '../domain/billing_models.dart';
import 'billing_providers.dart';

class SubscriptionScreen extends ConsumerStatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen> {
  late final AppLifecycleListener _lifecycle;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // Carrier status changes outside the app (renewals, SMS cancellation),
    // so re-read it whenever the screen opens or the app comes back.
    _lifecycle = AppLifecycleListener(onResume: _refresh);
    if (ref.exists(subscriptionOverviewProvider)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _refresh();
      });
    }
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  void _refresh() => ref.invalidate(subscriptionOverviewProvider);

  Future<void> _pullToRefresh() async {
    try {
      _refresh();
      await ref.read(subscriptionOverviewProvider.future);
    } on Object {
      // The error state below already explains the failure.
    }
  }

  @override
  Widget build(BuildContext context) {
    final overview = ref.watch(subscriptionOverviewProvider);
    final auth = ref.watch(authControllerProvider);
    final l10n = AppLocalizations.of(context);
    ref.listen(subscriptionOverviewProvider, (_, next) {
      final data = next.asData?.value;
      if (data != null &&
          auth.status == AuthStatus.authenticated &&
          auth.accessChecked &&
          !auth.subscriptionAccess &&
          data.accessActive) {
        ref.read(authControllerProvider.notifier).recheckAccess();
      }
    });
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('সাবস্ক্রিপশন')),
      body: overview.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: KErrorState(
            failure: _failure(error),
            retryLabel: 'আবার চেষ্টা করুন',
            onRetry: () => ref.invalidate(subscriptionOverviewProvider),
          ),
        ),
        data: (data) => RefreshIndicator(
          onRefresh: _pullToRefresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              KSpacing.md,
              KSpacing.sm,
              KSpacing.md,
              KSpacing.xxl,
            ),
            children: [
              if (!data.accessActive) ...[
                Semantics(
                  liveRegion: true,
                  child: Text(l10n.subscriptionInactiveLogin),
                ),
                const SizedBox(height: KSpacing.md),
              ],
              // Learning never needs a subscription.
              if (!auth.subscriptionAccess &&
                  auth.freeModules.contains('LEARN')) ...[
                Card(
                  key: const ValueKey('free-learning'),
                  child: ListTile(
                    leading: const Icon(
                      Icons.school_outlined,
                      color: KColors.primary,
                    ),
                    title: const KLocalizedText('শেখা বিনামূল্যে'),
                    subtitle: const KLocalizedText(
                      'কোর্স ও শেখার সুযোগ সাবস্ক্রিপশন ছাড়াই ব্যবহার করা যায়।',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push(AppRoutes.exploreLearn),
                  ),
                ),
                const SizedBox(height: KSpacing.md),
              ],
              if (!auth.subscriptionAccess)
                TextButton(
                  onPressed: () =>
                      ref.read(authControllerProvider.notifier).logout(),
                  child: Text(l10n.passwordSignOut),
                ),
              if (data.accessActive && auth.needsPasswordSetup)
                TextButton(
                  onPressed: () => context.go(AppRoutes.passwordSetup),
                  child: Text(l10n.passwordSetupTitle),
                ),
              if (data.operatorPlanMissing) ...[
                const _WarningBanner(
                  icon: Icons.build_circle_outlined,
                  message:
                      'সাবস্ক্রিপশন প্ল্যান প্রস্তুত করা হচ্ছে। সহায়তার সঙ্গে যোগাযোগ করুন।',
                ),
                const SizedBox(height: KSpacing.md),
              ],
              _AccessCard(overview: data),
              const SizedBox(height: KSpacing.md),
              _OperatorCard(
                identity: data.operatorIdentity,
                carrierStatus: data.carrierStatus,
              ),
              if (data.operatorStatusRefreshFailed) ...[
                const SizedBox(height: KSpacing.sm),
                const _WarningBanner(
                  icon: Icons.sync_problem_outlined,
                  message:
                      'অপারেটরের সর্বশেষ অবস্থা এখন যাচাই করা যায়নি। আগের নিরাপদ অবস্থা দেখানো হচ্ছে; কিছুক্ষণ পর আবার রিফ্রেশ করুন।',
                ),
              ],
              const SizedBox(height: KSpacing.lg),
              KLocalizedText(
                'প্ল্যানসমূহ',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: KSpacing.xs),
              const KLocalizedText(
                'মূল্য, মেয়াদ ও সুবিধা দেখে আপনার জন্য উপযুক্ত প্ল্যান বাছুন।',
                style: TextStyle(color: KColors.textSecondary),
              ),
              if (data.plans.isEmpty)
                const KEmptyState(
                  icon: Icons.event_note_outlined,
                  title: 'এখন কোনো প্ল্যান চালু নেই',
                  message:
                      'অ্যাডমিন প্ল্যান ও অপারেটর বিলিং প্রস্তুত করলে এখানে দেখা যাবে।',
                )
              else
                ...data.plans.map(
                  (plan) => _PlanCard(
                    plan: plan,
                    busy: _saving,
                    disabled:
                        data.current?.status == 'ACTIVE' ||
                        data.current?.status == 'PENDING',
                    onChoose: () => _request(data, plan),
                  ),
                ),
              const SizedBox(height: KSpacing.lg),
              const _ComingSoonCard(),
              if ({'ACTIVE', 'PENDING'}.contains(data.current?.status)) ...[
                const SizedBox(height: KSpacing.lg),
                OutlinedButton.icon(
                  onPressed: _saving ? null : () => _cancel(data),
                  icon: const Icon(Icons.cancel_outlined),
                  label: const KLocalizedText('সাবস্ক্রিপশন বাতিল করুন'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _request(
    SubscriptionOverview overview,
    SubscriptionPlan plan,
  ) async {
    final operator = await _chooseOperator(overview);
    if (operator == null || !mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        final languageCode = Localizations.localeOf(context).languageCode;
        final explanation = KaajLocalizations.text(
          context,
          'অনুরোধ নিশ্চিত করার আগে মূল্য ও মেয়াদ দেখুন। অপারেটর নিবন্ধন নিশ্চিত হলে অনুমোদিত নিয়মে মোবাইল ব্যালেন্স থেকে চার্জ কাটা হতে পারে।',
        );
        return AlertDialog(
          title: const KLocalizedText('সাবস্ক্রিপশন অনুরোধ পাঠাবেন?'),
          content: Text(
            '${plan.nameFor(languageCode)} · ${operator.nameFor(languageCode)}\n\n$explanation',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const KLocalizedText('ফিরুন'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const KLocalizedText('অনুরোধ পাঠান'),
            ),
          ],
        );
      },
    );
    if (confirmed != true || !mounted) return;
    setState(() => _saving = true);
    try {
      final updated = await ref
          .read(billingRepositoryProvider)
          .requestSubscription(planId: plan.id, operatorCode: operator.code);
      ref.invalidate(subscriptionOverviewProvider);
      if (mounted) {
        _snack(
          updated.current?.status == 'ACTIVE'
              ? 'সাবস্ক্রিপশন সক্রিয় হয়েছে।'
              : 'সাবস্ক্রিপশন অনুরোধ অপেক্ষমাণ আছে।',
        );
      }
    } on Object catch (error) {
      if (mounted) _snackFailure(error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<MobileOperatorOption?> _chooseOperator(
    SubscriptionOverview overview,
  ) async {
    if (overview.operators.isEmpty) {
      _snack('এই মুহূর্তে কোনো সমর্থিত অপারেটর নেই।');
      return null;
    }
    final hinted = overview.operatorIdentity?.operator;
    if (hinted != null &&
        overview.operators.any((item) => item.code == hinted.code)) {
      return hinted;
    }
    return showModalBottomSheet<MobileOperatorOption>(
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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              KLocalizedText(
                'মোবাইল অপারেটর বাছুন',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: KSpacing.xs),
              const KLocalizedText(
                'নম্বরের প্রিফিক্স শুধু সম্ভাব্য অপারেটর বোঝায়; এটি যাচাই নয়।',
              ),
              const SizedBox(height: KSpacing.md),
              ...overview.operators.map(
                (operator) => ListTile(
                  leading: const CircleAvatar(
                    child: Icon(Icons.sim_card_outlined),
                  ),
                  title: Text(
                    operator.nameFor(
                      Localizations.localeOf(context).languageCode,
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.pop(context, operator),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _cancel(SubscriptionOverview overview) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const KLocalizedText('সাবস্ক্রিপশন বাতিল করবেন?'),
        content: const KLocalizedText(
          'বাতিল করলে অপারেটরের দৈনিক চার্জ বন্ধ হবে এবং KAAJ সাবস্ক্রিপশনের সুবিধা এখনই শেষ হবে।',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const KLocalizedText('না, চালু রাখুন'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const KLocalizedText('হ্যাঁ, বাতিল করুন'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _saving = true);
    try {
      final updated = await ref
          .read(billingRepositoryProvider)
          .cancelSubscription();
      _refresh();
      if (!mounted) return;
      _snack('সাবস্ক্রিপশন বাতিল হয়েছে।');
      final auth = ref.read(authControllerProvider);
      if (updated != null &&
          !updated.accessActive &&
          auth.status == AuthStatus.authenticated &&
          auth.subscriptionAccess) {
        ref.read(authControllerProvider.notifier).recheckAccess();
      }
    } on Object catch (error) {
      if (!mounted) return;
      final failure = _failure(error);
      if (failure.code == 'OPERATOR_UNSUBSCRIBE_FAILED') {
        // Clear the busy state first so no spinner keeps running behind
        // the sheet.
        setState(() => _saving = false);
        await _showSmsFallback(
          CancelInstructions.fromDetails(failure.details) ??
              overview.cancelInstructions,
        );
      } else {
        _snackFailure(failure);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _showSmsFallback(CancelInstructions instructions) =>
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (_) => SmsCancelSheet(
          instructions: instructions,
          launcher: ref.read(externalUriLauncherProvider),
        ),
      );

  void _snack(String value) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: KLocalizedText(value)));

  void _snackFailure(Object error) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(
          localizedFailureMessage(
            AppLocalizations.of(context),
            _failure(error),
          ),
        ),
      ),
    );
}

/// Shown when the operator could not process an in-app cancellation. The
/// user can still stop billing by sending the keyword to the short code.
class SmsCancelSheet extends StatefulWidget {
  const SmsCancelSheet({
    required this.instructions,
    required this.launcher,
    super.key,
  });

  final CancelInstructions instructions;
  final ExternalUriLauncher launcher;

  @override
  State<SmsCancelSheet> createState() => _SmsCancelSheetState();
}

class _SmsCancelSheetState extends State<SmsCancelSheet> {
  String? _notice;
  bool _noticeIsWarning = false;

  Future<void> _openSms() async {
    var opened = false;
    try {
      opened = await widget.launcher(widget.instructions.smsUri);
    } on Object {
      opened = false;
    }
    if (!mounted || opened) return;
    setState(() {
      _notice = 'SMS অ্যাপ খোলা যায়নি। বার্তাটি কপি করে নিজে পাঠান।';
      _noticeIsWarning = true;
    });
  }

  Future<void> _copy() async {
    await Clipboard.setData(
      ClipboardData(text: widget.instructions.smsKeyword),
    );
    if (!mounted) return;
    setState(() {
      _notice = 'বার্তা কপি হয়েছে।';
      _noticeIsWarning = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final instructions = widget.instructions;
    final textTheme = Theme.of(context).textTheme;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          KSpacing.md,
          0,
          KSpacing.md,
          KSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            KLocalizedText('SMS দিয়ে বাতিল করুন', style: textTheme.titleLarge),
            const SizedBox(height: KSpacing.sm),
            const KLocalizedText(
              'অপারেটর এখন বাতিলের অনুরোধ গ্রহণ করেনি। নিচের বার্তাটি SMS করে পাঠান, তারপর এই পেজ রিফ্রেশ করুন।',
            ),
            const SizedBox(height: KSpacing.md),
            Container(
              padding: const EdgeInsets.all(KSpacing.md),
              decoration: BoxDecoration(
                color: KColors.surfaceAlt,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SmsValueRow(
                    label: 'যে বার্তা পাঠাবেন',
                    value: instructions.smsKeyword,
                  ),
                  const SizedBox(height: KSpacing.sm),
                  _SmsValueRow(
                    label: 'পাঠানোর নম্বর',
                    value: instructions.shortCode,
                  ),
                ],
              ),
            ),
            const SizedBox(height: KSpacing.md),
            FilledButton.icon(
              onPressed: _openSms,
              icon: const Icon(Icons.sms_outlined),
              label: const KLocalizedText('SMS অ্যাপ খুলুন'),
            ),
            const SizedBox(height: KSpacing.sm),
            OutlinedButton.icon(
              onPressed: _copy,
              icon: const Icon(Icons.copy_outlined),
              label: const KLocalizedText('বার্তা কপি করুন'),
            ),
            if (_notice case final notice?) ...[
              const SizedBox(height: KSpacing.sm),
              Semantics(
                liveRegion: true,
                child: KLocalizedText(
                  notice,
                  style: TextStyle(
                    color: _noticeIsWarning ? KColors.danger : KColors.success,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SmsValueRow extends StatelessWidget {
  const _SmsValueRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SizedBox(
        width: 120,
        child: KLocalizedText(
          label,
          style: const TextStyle(color: KColors.textSecondary),
        ),
      ),
      Expanded(
        child: SelectableText(
          value,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
    ],
  );
}

class _WarningBanner extends StatelessWidget {
  const _WarningBanner({required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(KSpacing.md),
    decoration: BoxDecoration(
      color: KColors.warning.withValues(alpha: .10),
      border: Border.all(color: KColors.warning.withValues(alpha: .35)),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: KColors.warning),
        const SizedBox(width: KSpacing.sm),
        Expanded(child: KLocalizedText(message)),
      ],
    ),
  );
}

class JobPaymentHistoryScreen extends ConsumerWidget {
  const JobPaymentHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payments = ref.watch(jobPaymentsProvider);
    return Scaffold(
      appBar: AppBar(title: const KLocalizedText('কাজের পেমেন্ট ইতিহাস')),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(jobPaymentsProvider.future),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            KSpacing.md,
            KSpacing.sm,
            KSpacing.md,
            KSpacing.xxl,
          ),
          children: [
            const _CashExplanationCard(),
            const SizedBox(height: KSpacing.md),
            payments.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(KSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (error, _) => KErrorState(
                failure: _failure(error),
                retryLabel: 'আবার চেষ্টা করুন',
                onRetry: () => ref.invalidate(jobPaymentsProvider),
              ),
              data: (items) => items.isEmpty
                  ? const KEmptyState(
                      icon: Icons.receipt_long_outlined,
                      title: 'এখনো কোনো পেমেন্ট রেকর্ড নেই',
                      message:
                          'কাজ সম্পন্ন হলে নগদ পেমেন্টের অবস্থা এখানে দেখা যাবে।',
                    )
                  : Column(
                      children: items
                          .map(
                            (item) => _PaymentHistoryCard(
                              item: item,
                              onTap: () => context.push(
                                AppRoutes.assignmentDetail(item.assignmentId),
                              ),
                            ),
                          )
                          .toList(growable: false),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccessCard extends StatelessWidget {
  const _AccessCard({required this.overview});

  final SubscriptionOverview overview;

  @override
  Widget build(BuildContext context) {
    final current = overview.current;
    final status = current?.status ?? 'INACTIVE';
    return KCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: _statusColor(status).withValues(alpha: .12),
                child: Icon(
                  Icons.workspace_premium_outlined,
                  color: _statusColor(status),
                ),
              ),
              const SizedBox(width: KSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const KLocalizedText('বর্তমান সাবস্ক্রিপশন'),
                    KLocalizedText(
                      _subscriptionStatus(status),
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: _statusColor(status),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (current != null) ...[
            const SizedBox(height: KSpacing.md),
            Text(
              current.plan.nameFor(
                Localizations.localeOf(context).languageCode,
              ),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            Text(_priceWording(context, current.plan)),
            if (current.expiresAt != null)
              KLocalizedText(
                'মেয়াদ শেষ: ${KFormat.dateTime(context, current.expiresAt!)}',
              ),
            if (current.paymentStatus != null)
              KLocalizedText(
                'সাবস্ক্রিপশন পেমেন্ট: ${_subscriptionStatus(current.paymentStatus!)}',
              ),
          ],
          if (!overview.gateEnabled) ...[
            const SizedBox(height: KSpacing.md),
            const KLocalizedText(
              'সাবস্ক্রিপশন এখন পরীক্ষামূলক পর্যায়ে আছে। বর্তমান কাজের সুবিধাগুলো বন্ধ করা হয়নি।',
              style: TextStyle(color: KColors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}

class _OperatorCard extends StatelessWidget {
  const _OperatorCard({required this.identity, this.carrierStatus});

  final CarrierStatus? carrierStatus;
  final OperatorIdentity? identity;

  @override
  Widget build(BuildContext context) {
    final operator = identity?.operator;
    return KCard(
      child: Row(
        children: [
          const Icon(Icons.sim_card_outlined, color: KColors.primary),
          const SizedBox(width: KSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const KLocalizedText('অপারেটর সংযোগ'),
                Text(
                  operator?.nameFor(
                        Localizations.localeOf(context).languageCode,
                      ) ??
                      KaajLocalizations.text(
                        context,
                        'সমর্থিত অপারেটর পাওয়া যায়নি',
                      ),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                KLocalizedText(
                  identity?.status == 'VERIFIED'
                      ? 'অপারেটর যাচাই সম্পন্ন'
                      : 'অপারেটর যাচাই অপেক্ষমাণ',
                  style: const TextStyle(color: KColors.textSecondary),
                ),
                if (carrierStatus case final status?)
                  KLocalizedText(
                    _carrierStatusLabel(status),
                    style: TextStyle(
                      color: status == CarrierStatus.registered
                          ? KColors.success
                          : KColors.warning,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.busy,
    required this.disabled,
    required this.onChoose,
  });

  final bool busy;
  final bool disabled;
  final VoidCallback onChoose;
  final SubscriptionPlan plan;

  @override
  Widget build(BuildContext context) => KCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          plan.nameFor(Localizations.localeOf(context).languageCode),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: KSpacing.xs),
        Text(
          _priceWording(context, plan),
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(color: KColors.primary),
        ),
        if (plan.descriptionFor(Localizations.localeOf(context).languageCode)
            case final description?) ...[
          const SizedBox(height: KSpacing.sm),
          Text(description),
        ],
        const SizedBox(height: KSpacing.md),
        KPrimaryButton(
          label: 'প্ল্যানের অনুরোধ পাঠান',
          isLoading: busy,
          onPressed: disabled ? null : onChoose,
        ),
      ],
    ),
  );
}

class _ComingSoonCard extends StatelessWidget {
  const _ComingSoonCard();

  @override
  Widget build(BuildContext context) => const KCard(
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.schedule_outlined, color: KColors.secondary),
        SizedBox(width: KSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              KLocalizedText(
                'শিগগির আসছে',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              KLocalizedText(
                'অনলাইন পেমেন্ট, মোবাইল ব্যাংকিং ও কর্মীর টাকা উত্তোলন এখনো চালু নয়।',
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _CashExplanationCard extends StatelessWidget {
  const _CashExplanationCard();

  @override
  Widget build(BuildContext context) => const KCard(
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.payments_outlined, color: KColors.primary),
        SizedBox(width: KSpacing.md),
        Expanded(
          child: KLocalizedText(
            'এই সংস্করণে কাজের টাকা সরাসরি নগদে দিন। কাজের মালিক “পেমেন্ট হয়েছে” নিশ্চিত করলে KAAJ শুধু রেকর্ড রাখে; KAAJ টাকা গ্রহণ বা কমিশন কাটে না।',
          ),
        ),
      ],
    ),
  );
}

class _PaymentHistoryCard extends StatelessWidget {
  const _PaymentHistoryCard({required this.item, required this.onTap});

  final JobPaymentRecord item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => KCard(
    padding: EdgeInsets.zero,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    item.jobTitle,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                _StatusBadge(status: item.status),
              ],
            ),
            const SizedBox(height: KSpacing.sm),
            Text(
              '${KFormat.money(context, item.agreedPoisha)} · ${KaajLocalizations.text(context, item.role == 'WORKER' ? 'কর্মী' : 'কাজের মালিক')}',
            ),
            KLocalizedText(
              item.cashRecordedAt == null
                  ? 'তৈরি হয়েছে: ${KFormat.dateTime(context, item.createdAt)}'
                  : 'পেমেন্ট রেকর্ড: ${KFormat.dateTime(context, item.cashRecordedAt!)}',
              style: const TextStyle(color: KColors.textSecondary),
            ),
          ],
        ),
      ),
    ),
  );
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: _statusColor(status).withValues(alpha: .10),
      borderRadius: BorderRadius.circular(999),
    ),
    child: KLocalizedText(
      _paymentStatus(status),
      style: TextStyle(
        color: _statusColor(status),
        fontWeight: FontWeight.w600,
      ),
    ),
  );
}

Failure _failure(Object error) => error is Failure
    ? error
    : const Failure(
        kind: FailureKind.unknown,
        message: 'অনুরোধটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।',
      );

/// Daily carrier plans read as `৳২.৭৮/দিন + ভ্যাট, প্রতিদিন নবায়ন`.
String _priceWording(BuildContext context, SubscriptionPlan plan) {
  final price = KFormat.money(context, plan.pricePoisha);
  const daily = '/দিন + ভ্যাট, প্রতিদিন নবায়ন';
  if (plan.durationDays == 1) {
    return price + KaajLocalizations.text(context, daily);
  }
  final period = KaajLocalizations.text(
    context,
    '${plan.durationDays} দিনের জন্য',
  );
  return '$price · $period';
}

String _carrierStatusLabel(CarrierStatus status) => switch (status) {
  CarrierStatus.registered => 'অপারেটরে সাবস্ক্রিপশন চালু',
  CarrierStatus.unregistered => 'অপারেটরে সাবস্ক্রিপশন বন্ধ',
  CarrierStatus.chargePending =>
    'অপারেটরের চার্জ অপেক্ষমাণ; মেয়াদ শেষ হওয়া পর্যন্ত সুবিধা চালু থাকবে',
};

String _subscriptionStatus(String status) => switch (status) {
  'ACTIVE' => 'সক্রিয়',
  'PENDING' => 'অপেক্ষমাণ',
  'PAID' => 'পরিশোধিত',
  'EXPIRED' => 'মেয়াদ শেষ',
  'CANCELLED' => 'বাতিল',
  'FAILED' => 'ব্যর্থ',
  _ => 'নিষ্ক্রিয়',
};

String _paymentStatus(String status) => switch (status) {
  'CASH_RECORDED' => 'নগদ পেমেন্ট হয়েছে',
  'DISPUTED' => 'বিরোধ চলছে',
  _ => 'পেমেন্ট অপেক্ষমাণ',
};

Color _statusColor(String status) => switch (status) {
  'ACTIVE' || 'PAID' || 'CASH_RECORDED' => KColors.success,
  'DISPUTED' || 'FAILED' => KColors.danger,
  'PENDING' => KColors.warning,
  _ => KColors.textSecondary,
};

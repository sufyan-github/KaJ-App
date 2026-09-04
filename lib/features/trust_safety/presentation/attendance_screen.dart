import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/failure.dart';
import '../../../core/permissions/permission_gateway.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_primary_button.dart';
import '../domain/trust_models.dart';
import 'trust_safety_providers.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({
    required this.assignmentId,
    required this.title,
    required this.isPoster,
    super.key,
  });
  final String assignmentId;
  final String title;
  final bool isPoster;

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  bool _loading = false;
  bool _consent = false;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(attendanceProvider(widget.assignmentId));
    return Scaffold(
      appBar: AppBar(title: const Text('উপস্থিতি ও কাজের সময়')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(KSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_message(error), textAlign: TextAlign.center),
                const SizedBox(height: KSpacing.md),
                FilledButton(
                  onPressed: () =>
                      ref.invalidate(attendanceProvider(widget.assignmentId)),
                  child: const Text('আবার চেষ্টা করুন'),
                ),
              ],
            ),
          ),
        ),
        data: (attendance) => _body(attendance),
      ),
    );
  }

  Widget _body(AttendanceState state) {
    final checkedIn = state.checkinAt != null;
    final checkedOut = state.checkoutAt != null;
    return ListView(
      padding: const EdgeInsets.all(KSpacing.lg),
      children: [
        Text(widget.title, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: KSpacing.md),
        _StatusCard(state: state),
        const SizedBox(height: KSpacing.md),
        const Card(
          child: Padding(
            padding: EdgeInsets.all(KSpacing.md),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.privacy_tip_outlined, color: KColors.primary),
                SizedBox(width: KSpacing.sm),
                Expanded(
                  child: Text(
                    'লোকেশন শুধু এই চেক-ইন বা চেক-আউটের মুহূর্তে নেওয়া হবে। KAAJ ব্যাকগ্রাউন্ডে আপনার অবস্থান অনুসরণ করে না।',
                  ),
                ),
              ],
            ),
          ),
        ),
        CheckboxListTile(
          value: _consent,
          onChanged: checkedOut
              ? null
              : (value) => setState(() => _consent = value ?? false),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          title: const Text('এই একবার লোকেশন ব্যবহারে আমি সম্মতি দিচ্ছি।'),
        ),
        if (!checkedIn)
          KPrimaryButton(
            label: 'লোকেশন নিয়ে চেক-ইন করুন',
            isLoading: _loading,
            onPressed: !_consent || _loading ? null : () => _act(state, true),
          )
        else if (!checkedOut) ...[
          _ElapsedTimer(startedAt: state.checkinAt!),
          const SizedBox(height: KSpacing.md),
          KPrimaryButton(
            label: 'কাজ শেষ করে চেক-আউট',
            isLoading: _loading,
            onPressed: !_consent || _loading
                ? null
                : () => _confirmCheckout(state),
          ),
        ] else
          Card(
            color: KColors.success.withValues(alpha: .08),
            child: ListTile(
              leading: const Icon(Icons.task_alt, color: KColors.success),
              title: const Text('উপস্থিতি সম্পন্ন'),
              subtitle: Text(
                'সার্ভার নির্ধারিত কাজের সময়: ${state.minutesWorked ?? 0} মিনিট',
              ),
            ),
          ),
        const SizedBox(height: KSpacing.sm),
        OutlinedButton.icon(
          onPressed: widget.isPoster && !checkedIn ? _override : null,
          icon: const Icon(Icons.fact_check_outlined),
          label: const Text('লোকেশন ব্যর্থ হলে উপস্থিতি নিশ্চিত করুন'),
        ),
        const SizedBox(height: KSpacing.sm),
        Text(
          'ইন্টারনেট ছাড়া উপস্থিতি জমা হয় না। দূরত্ব ও সময় সার্ভার যাচাই করে; ফোনের দেখানো সময় চূড়ান্ত নয়।',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: KColors.textSecondary),
        ),
      ],
    );
  }

  Future<void> _confirmCheckout(AttendanceState state) async {
    final notes = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('চেক-আউট নিশ্চিত করবেন?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'জমা দেওয়ার পর এটি বদলানো যাবে না। গ্রাহক কাজটি পর্যালোচনা করবেন।',
            ),
            const SizedBox(height: KSpacing.md),
            TextField(
              controller: notes,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'সমাপ্তির নোট (ঐচ্ছিক)',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('ফিরে যান'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('চেক-আউট'),
          ),
        ],
      ),
    );
    if (confirmed == true) await _act(state, false, notes: notes.text);
  }

  Future<void> _act(
    AttendanceState state,
    bool checkingIn, {
    String? notes,
  }) async {
    setState(() => _loading = true);
    try {
      final permission = await const PermissionGateway().request(
        KPermission.location,
      );
      if (permission != KPermissionStatus.granted) {
        throw const Failure(
          kind: FailureKind.forbidden,
          message:
              'লোকেশন অনুমতি প্রয়োজন। সেটিংস থেকে অনুমতি দিয়ে আবার চেষ্টা করুন।',
        );
      }
      final location = await ref.read(locationGatewayProvider).current();
      if (location.accuracyM > state.maxAccuracyM) {
        throw Failure(
          kind: FailureKind.validation,
          message:
              'লোকেশন যথেষ্ট নির্ভুল নয় (${location.accuracyM.round()} মিটার)। খোলা জায়গায় গিয়ে আবার চেষ্টা করুন।',
        );
      }
      final repository = ref.read(trustSafetyRepositoryProvider);
      if (checkingIn) {
        await repository.checkIn(
          widget.assignmentId,
          location,
          state.consentVersion,
        );
      } else {
        await repository.checkOut(
          widget.assignmentId,
          location,
          state.consentVersion,
          notes: notes,
        );
      }
      ref.invalidate(attendanceProvider(widget.assignmentId));
      if (mounted) {
        _snack(checkingIn ? 'চেক-ইন সফল হয়েছে।' : 'চেক-আউট সফল হয়েছে।');
      }
    } on Object catch (error) {
      if (mounted) _snack(_message(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _override() async {
    final controller = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('কর্মীর উপস্থিতি নিশ্চিত করুন'),
        content: TextField(
          controller: controller,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'কারণ (কমপক্ষে ১০ অক্ষর)',
            hintText: 'যেমন: লোকেশন সিগন্যাল না থাকলেও কর্মী উপস্থিত ছিলেন',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('বাতিল'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('নিশ্চিত করুন'),
          ),
        ],
      ),
    );
    if (accepted != true || controller.text.trim().length < 10) return;
    try {
      await ref
          .read(trustSafetyRepositoryProvider)
          .attendanceOverride(widget.assignmentId, controller.text);
      ref.invalidate(attendanceProvider(widget.assignmentId));
      if (mounted) _snack('উপস্থিতি নিশ্চিত করা হয়েছে।');
    } on Object catch (error) {
      if (mounted) _snack(_message(error));
    }
  }

  void _snack(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.state});
  final AttendanceState state;
  @override
  Widget build(BuildContext context) {
    final done = state.checkoutAt != null;
    final active = state.checkinAt != null && !done;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(KSpacing.md),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor:
                  (done
                          ? KColors.success
                          : active
                          ? KColors.warning
                          : KColors.info)
                      .withValues(alpha: .12),
              child: Icon(
                done
                    ? Icons.done_all
                    : active
                    ? Icons.timelapse
                    : Icons.location_searching,
              ),
            ),
            const SizedBox(width: KSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    done
                        ? 'কাজের সময় রেকর্ড হয়েছে'
                        : active
                        ? 'কাজ চলছে'
                        : 'চেক-ইন বাকি',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text(
                    'অনুমোদিত দূরত্ব ${state.geofenceRadiusM} মিটার${state.checkinDistanceM == null ? '' : ' · চেক-ইন ${state.checkinDistanceM} মিটার দূরে'}',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ElapsedTimer extends StatefulWidget {
  const _ElapsedTimer({required this.startedAt});
  final DateTime startedAt;
  @override
  State<_ElapsedTimer> createState() => _ElapsedTimerState();
}

class _ElapsedTimerState extends State<_ElapsedTimer> {
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => setState(() {}),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final duration = DateTime.now().difference(widget.startedAt.toLocal());
    return Semantics(
      liveRegion: true,
      child: Text(
        'চলমান সময় ${duration.inHours} ঘণ্টা ${duration.inMinutes.remainder(60)} মিনিট',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.titleMedium,
      ),
    );
  }
}

String _message(Object error) =>
    error is Failure ? error.message : 'কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।';

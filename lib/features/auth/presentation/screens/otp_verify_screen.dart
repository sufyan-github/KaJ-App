import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_error_message.dart';
import '../../../../core/widgets/k_primary_button.dart';
import '../../../../l10n/generated/app_localizations.dart';
import '../../../onboarding/presentation/controllers/onboarding_controller.dart';
import '../../domain/entities/otp_challenge.dart';
import '../../domain/usecases/auth_validators.dart';
import '../controllers/auth_controller.dart';
import '../controllers/auth_providers.dart';

class OtpVerifyScreen extends ConsumerStatefulWidget {
  const OtpVerifyScreen({required this.challenge, super.key});

  final OtpChallenge challenge;

  @override
  ConsumerState<OtpVerifyScreen> createState() => _OtpVerifyScreenState();
}

class _OtpVerifyScreenState extends ConsumerState<OtpVerifyScreen> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();
  Timer? _timer;
  late OtpChallenge _challenge;
  late DateTime _expiresAt;
  int _resendSeconds = 30;

  int get _remainingSeconds {
    final seconds = _expiresAt.difference(DateTime.now()).inSeconds;
    return seconds < 0 ? 0 : seconds;
  }

  @override
  void initState() {
    super.initState();
    _setChallenge(widget.challenge);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_resendSeconds > 0) _resendSeconds--;
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _codeController.dispose();
    super.dispose();
  }

  void _setChallenge(OtpChallenge challenge) {
    _challenge = challenge;
    _expiresAt = DateTime.now().add(
      Duration(seconds: challenge.expiresInSeconds),
    );
    _resendSeconds = 30;
  }

  Future<void> _verify() async {
    if (!_formKey.currentState!.validate()) return;
    final verified = await ref
        .read(authControllerProvider.notifier)
        .verifyOtp(_challenge, _codeController.text.trim());
    if (!mounted || !verified) return;
    if (ref.read(authControllerProvider).isNewUser) {
      await ref.read(onboardingControllerProvider.notifier).begin();
      if (!mounted) return;
      context.go(AppRoutes.onboardingProfile);
      return;
    }
    context.go(AppRoutes.home);
  }

  Future<void> _resend() async {
    final challenge = await ref
        .read(authControllerProvider.notifier)
        .requestOtp(_challenge.phone);
    if (!mounted || challenge == null) return;
    setState(() {
      _setChallenge(challenge);
      _codeController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(authControllerProvider);
    final isLoading = state.status == AuthStatus.loading;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: l10n.backToPhone,
          onPressed: isLoading ? null : () => context.go(AppRoutes.phone),
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(KSpacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.sms_outlined,
                      size: 52,
                      color: KColors.primary,
                    ),
                    const SizedBox(height: KSpacing.lg),
                    Text(
                      l10n.otpTitle,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: KSpacing.sm),
                    Text(
                      l10n.otpSubtitle(_maskedPhone(_challenge.phone)),
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: KColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: KSpacing.lg),
                    TextFormField(
                      controller: _codeController,
                      enabled: !isLoading,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.oneTimeCode],
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(6),
                      ],
                      style: const TextStyle(
                        fontSize: 24,
                        letterSpacing: 12,
                        fontWeight: FontWeight.w600,
                      ),
                      decoration: InputDecoration(
                        labelText: l10n.otpLabel,
                        helperText: _remainingSeconds == 0
                            ? l10n.codeExpired
                            : l10n.codeExpiresInMinutes(
                                (_remainingSeconds / 60).ceil(),
                              ),
                      ),
                      validator: (value) {
                        if (_remainingSeconds == 0) return l10n.codeExpired;
                        return AuthValidators.isValidOtp(value ?? '')
                            ? null
                            : l10n.invalidOtp;
                      },
                      onFieldSubmitted: (_) => _verify(),
                    ),
                    const SizedBox(height: KSpacing.md),
                    if (state.failure != null) ...[
                      KErrorMessage(failure: state.failure!),
                      const SizedBox(height: KSpacing.md),
                    ],
                    KPrimaryButton(
                      label: l10n.verifyCode,
                      isLoading: isLoading,
                      onPressed: _verify,
                    ),
                    const SizedBox(height: KSpacing.sm),
                    SizedBox(
                      width: double.infinity,
                      child: TextButton(
                        onPressed: isLoading || _resendSeconds > 0
                            ? null
                            : _resend,
                        child: Text(
                          _resendSeconds > 0
                              ? l10n.resendInSeconds(_resendSeconds)
                              : l10n.resendCode,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _maskedPhone(String phone) {
    if (phone.length < 7) return phone;
    return '${phone.substring(0, 5)}****${phone.substring(phone.length - 3)}';
  }
}

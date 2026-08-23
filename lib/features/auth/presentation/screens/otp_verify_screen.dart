import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_error_message.dart';
import '../../../../core/widgets/k_primary_button.dart';
import '../../../../l10n/generated/app_localizations.dart';
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

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (!_formKey.currentState!.validate()) return;
    final verified = await ref
        .read(authControllerProvider.notifier)
        .verifyOtp(widget.challenge, _codeController.text.trim());
    if (!mounted || !verified) return;
    context.go(AppRoutes.home);
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
                      l10n.otpSubtitle(_maskedPhone(widget.challenge.phone)),
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
                        helperText: l10n.codeExpiresInMinutes(
                          widget.challenge.expiresInSeconds ~/ 60,
                        ),
                      ),
                      validator: (value) =>
                          AuthValidators.isValidOtp(value ?? '')
                          ? null
                          : l10n.invalidOtp,
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
                        onPressed: isLoading
                            ? null
                            : () => context.go(AppRoutes.phone),
                        child: Text(l10n.resendCode),
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

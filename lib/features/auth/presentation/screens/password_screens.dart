import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failure.dart';
import '../../../../core/localization/locale_controller.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/widgets/k_error_message.dart';
import '../../../../core/widgets/k_primary_button.dart';
import '../../../../l10n/generated/app_localizations.dart';
import '../../../billing/presentation/billing_providers.dart';
import '../../../onboarding/presentation/controllers/onboarding_controller.dart';
import '../../domain/entities/otp_challenge.dart';
import '../../domain/usecases/auth_validators.dart';
import '../controllers/auth_providers.dart';

bool isValidMobilePassword(String value) =>
    value.runes.length >= 12 &&
    utf8.encode(value).length <= 72 &&
    !value.contains('\u0000');

class PasswordLoginScreen extends ConsumerStatefulWidget {
  const PasswordLoginScreen({super.key});
  @override
  ConsumerState<PasswordLoginScreen> createState() =>
      _PasswordLoginScreenState();
}

class _PasswordLoginScreenState extends ConsumerState<PasswordLoginScreen> {
  final _form = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  Failure? _failure;
  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _failure = null;
    });
    try {
      await ref
          .read(passwordRepositoryProvider)
          .login(AuthValidators.normalizePhone(_phone.text), _password.text);
      if (!mounted) return;
      _password.clear();
      ref.invalidate(subscriptionOverviewProvider);
      ref.read(authControllerProvider.notifier).passwordLoginSucceeded();
      context.go(AppRoutes.accessCheck);
    } on Object catch (error) {
      if (mounted) setState(() => _failure = ErrorMapper.from(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return _AuthPage(
      title: l.passwordLoginTitle,
      actions: [
        PopupMenuButton<String>(
          icon: const Icon(Icons.language),
          onSelected: (v) =>
              ref.read(localeControllerProvider.notifier).setLocale(Locale(v)),
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'bn', child: Text('বাংলা')),
            PopupMenuItem(value: 'en', child: Text('English')),
          ],
        ),
      ],
      children: [
        Text(l.passwordLoginSubtitle),
        const SizedBox(height: 24),
        Form(
          key: _form,
          child: AutofillGroup(
            child: Column(
              children: [
                _PhoneField(controller: _phone, enabled: !_busy),
                const SizedBox(height: 16),
                _PasswordField(
                  controller: _password,
                  label: l.passwordLabel,
                  enabled: !_busy,
                  validator: (v) =>
                      v == null || v.isEmpty ? l.passwordRequired : null,
                  onSubmitted: (_) => _login(),
                ),
              ],
            ),
          ),
        ),
        if (_failure != null) ...[
          const SizedBox(height: 16),
          KErrorMessage(failure: _failure!),
        ],
        const SizedBox(height: 24),
        KPrimaryButton(
          label: l.passwordSignIn,
          isLoading: _busy,
          onPressed: _login,
        ),
        TextButton(
          onPressed: _busy
              ? null
              : () => context.go(AppRoutes.passwordRecovery),
          child: Text(l.passwordForgot),
        ),
        const Divider(),
        OutlinedButton(
          onPressed: _busy ? null : () => context.go(AppRoutes.register),
          child: Text(l.passwordRegister),
        ),
      ],
    );
  }
}

class AuthAccessScreen extends ConsumerStatefulWidget {
  const AuthAccessScreen({super.key});
  @override
  ConsumerState<AuthAccessScreen> createState() => _AuthAccessScreenState();
}

class _AuthAccessScreenState extends ConsumerState<AuthAccessScreen> {
  Failure? _failure;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  Future<void> _check() async {
    setState(() => _failure = null);
    try {
      final hasPassword = await ref
          .read(passwordRepositoryProvider)
          .hasPassword();
      final overview = await ref.refresh(subscriptionOverviewProvider.future);
      if (!mounted) return;
      final canSet =
          (overview.current?.status == 'ACTIVE' &&
              overview.current?.paymentStatus == 'PAID') ||
          (!overview.operatorStatusRefreshFailed &&
              overview.operatorIdentity?.status == 'VERIFIED');
      ref
          .read(authControllerProvider.notifier)
          .resolveAccess(
            allowed: overview.accessActive,
            needsPassword: !hasPassword && canSet,
          );
      context.go(AppRoutes.home);
    } on Object catch (error) {
      if (mounted) setState(() => _failure = ErrorMapper.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return _AuthPage(
      title: l.passwordCheckAccess,
      children: [
        if (_failure == null)
          const Center(child: CircularProgressIndicator())
        else ...[
          KErrorMessage(failure: _failure!),
          const SizedBox(height: 16),
          KPrimaryButton(label: l.passwordRetry, onPressed: _check),
        ],
        TextButton(
          onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          child: Text(l.passwordSignOut),
        ),
      ],
    );
  }
}

class PasswordSetupScreen extends ConsumerStatefulWidget {
  const PasswordSetupScreen({super.key});
  @override
  ConsumerState<PasswordSetupScreen> createState() =>
      _PasswordSetupScreenState();
}

class _PasswordSetupScreenState extends ConsumerState<PasswordSetupScreen> {
  final _form = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  Failure? _failure;
  bool? _hasPassword;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _lookup());
  }

  Future<void> _lookup() async {
    setState(() => _failure = null);
    try {
      final hasPassword = await ref
          .read(passwordRepositoryProvider)
          .hasPassword();
      if (mounted) setState(() => _hasPassword = hasPassword);
    } on Object catch (error) {
      if (mounted) setState(() => _failure = ErrorMapper.from(error));
    }
  }

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _failure = null;
    });
    try {
      await ref.read(passwordRepositoryProvider).setup(_password.text);
      if (!mounted) return;
      _password.clear();
      _confirm.clear();
      if (ref.read(authControllerProvider).isNewUser) {
        await ref.read(onboardingControllerProvider.notifier).begin();
        if (!mounted) return;
      }
      ref.read(authControllerProvider.notifier).passwordConfigured();
      context.go(AppRoutes.home);
    } on Object catch (error) {
      if (mounted) setState(() => _failure = ErrorMapper.from(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    if (_hasPassword != false) {
      return _AuthPage(
        title: l.passwordManage,
        children: [
          if (_hasPassword == true) ...[
            Text(l.passwordAlreadySet),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: () => context.go(AppRoutes.passwordRecovery),
              child: Text(l.passwordForgot),
            ),
          ] else if (_failure != null) ...[
            KErrorMessage(failure: _failure!),
            TextButton(onPressed: _lookup, child: Text(l.passwordRetry)),
          ] else
            const Center(child: CircularProgressIndicator()),
        ],
      );
    }
    return _AuthPage(
      title: l.passwordSetupTitle,
      children: [
        Text(l.passwordSetupSubtitle),
        const SizedBox(height: 16),
        Text(l.passwordRules),
        const SizedBox(height: 24),
        Form(
          key: _form,
          child: Column(
            children: [
              _PasswordField(
                controller: _password,
                label: l.passwordLabel,
                enabled: !_busy,
                newPassword: true,
                validator: (v) =>
                    isValidMobilePassword(v ?? '') ? null : l.passwordRules,
              ),
              const SizedBox(height: 16),
              _PasswordField(
                controller: _confirm,
                label: l.confirmPasswordLabel,
                enabled: !_busy,
                newPassword: true,
                validator: (v) =>
                    v == _password.text ? null : l.passwordMismatch,
                onSubmitted: (_) => _save(),
              ),
            ],
          ),
        ),
        if (_failure != null) ...[
          const SizedBox(height: 16),
          KErrorMessage(failure: _failure!),
        ],
        const SizedBox(height: 24),
        KPrimaryButton(
          label: l.passwordSave,
          isLoading: _busy,
          onPressed: _save,
        ),
        TextButton(
          onPressed: _busy ? null : () => context.go(AppRoutes.subscription),
          child: Text(l.passwordContinueSubscription),
        ),
        TextButton(
          onPressed: _busy
              ? null
              : () => ref.read(authControllerProvider.notifier).logout(),
          child: Text(l.passwordSignOut),
        ),
      ],
    );
  }
}

class PasswordRecoveryScreen extends ConsumerStatefulWidget {
  const PasswordRecoveryScreen({super.key});
  @override
  ConsumerState<PasswordRecoveryScreen> createState() =>
      _PasswordRecoveryScreenState();
}

class _PasswordRecoveryScreenState
    extends ConsumerState<PasswordRecoveryScreen> {
  final _form = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _consent = false;
  bool _busy = false;
  bool _done = false;
  OtpChallenge? _challenge;
  Failure? _failure;
  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_consent || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _failure = null;
    });
    try {
      final repository = ref.read(passwordRepositoryProvider);
      if (_challenge == null) {
        final challenge = await repository.requestRecovery(
          AuthValidators.normalizePhone(_phone.text),
        );
        if (mounted) {
          setState(() {
            _challenge = challenge;
            _consent = false;
          });
        }
      } else {
        await repository.reset(_challenge!, _code.text.trim(), _password.text);
        if (mounted) {
          ref.read(authControllerProvider.notifier).passwordRecoverySucceeded();
          setState(() {
            _done = true;
            _password.clear();
            _confirm.clear();
            _code.clear();
          });
        }
      }
    } on Object catch (error) {
      if (mounted) setState(() => _failure = ErrorMapper.from(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return _AuthPage(
      title: l.passwordRecoveryTitle,
      children: [
        if (_done)
          Text(l.passwordResetSuccess)
        else
          Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_challenge == null)
                  _PhoneField(controller: _phone, enabled: !_busy)
                else ...[
                  Text(l.passwordRecoverySent),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _code,
                    enabled: !_busy,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    maxLength: 6,
                    decoration: InputDecoration(labelText: l.otpLabel),
                    validator: (v) => RegExp(r'^\d{6}$').hasMatch(v ?? '')
                        ? null
                        : l.otpLabel,
                  ),
                  const SizedBox(height: 16),
                  _PasswordField(
                    controller: _password,
                    label: l.passwordLabel,
                    enabled: !_busy,
                    newPassword: true,
                    validator: (v) =>
                        isValidMobilePassword(v ?? '') ? null : l.passwordRules,
                  ),
                  const SizedBox(height: 16),
                  _PasswordField(
                    controller: _confirm,
                    label: l.confirmPasswordLabel,
                    enabled: !_busy,
                    newPassword: true,
                    validator: (v) =>
                        v == _password.text ? null : l.passwordMismatch,
                    onSubmitted: (_) => _submit(),
                  ),
                ],
                const SizedBox(height: 16),
                CheckboxListTile(
                  value: _consent,
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  onChanged: _busy
                      ? null
                      : (v) => setState(() => _consent = v ?? false),
                  title: Text(
                    _challenge == null
                        ? l.passwordRecoveryConsent
                        : l.passwordRecoveryVerifyConsent,
                  ),
                ),
                if (_failure != null) KErrorMessage(failure: _failure!),
                const SizedBox(height: 16),
                KPrimaryButton(
                  label: _challenge == null ? l.sendCode : l.passwordReset,
                  isLoading: _busy,
                  onPressed: _consent ? _submit : null,
                ),
                if (_challenge != null)
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () => setState(() {
                            _challenge = null;
                            _consent = false;
                            _code.clear();
                            _failure = null;
                          }),
                    child: Text(l.passwordRequestAnother),
                  ),
              ],
            ),
          ),
        TextButton(
          onPressed: _busy ? null : () => context.go(AppRoutes.phone),
          child: Text(l.passwordBackToLogin),
        ),
      ],
    );
  }
}

class _AuthPage extends StatelessWidget {
  const _AuthPage({required this.title, required this.children, this.actions});
  final String title;
  final List<Widget> children;
  final List<Widget>? actions;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('KAAJ'), actions: actions),
    body: SafeArea(
      child: Align(
        alignment: Alignment.topCenter,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(title, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 16),
                ...children,
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class _PhoneField extends StatelessWidget {
  const _PhoneField({required this.controller, required this.enabled});
  final TextEditingController controller;
  final bool enabled;
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return TextFormField(
      controller: controller,
      enabled: enabled,
      keyboardType: TextInputType.phone,
      textInputAction: TextInputAction.next,
      autofillHints: const [AutofillHints.username],
      decoration: InputDecoration(
        labelText: l.phoneLabel,
        hintText: l.phoneHint,
        prefixIcon: const Icon(Icons.phone_outlined),
      ),
      validator: (v) => !AuthValidators.isValidPhone(v ?? '')
          ? l.invalidPhone
          : !AuthValidators.isSupportedOperatorPhone(v ?? '')
          ? l.unsupportedOperatorPhone
          : null,
    );
  }
}

class _PasswordField extends StatefulWidget {
  const _PasswordField({
    required this.controller,
    required this.label,
    required this.enabled,
    required this.validator,
    this.onSubmitted,
    this.newPassword = false,
  });
  final TextEditingController controller;
  final String label;
  final bool enabled;
  final bool newPassword;
  final String? Function(String?) validator;
  final ValueChanged<String>? onSubmitted;
  @override
  State<_PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<_PasswordField> {
  bool _hidden = true;
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return TextFormField(
      controller: widget.controller,
      enabled: widget.enabled,
      obscureText: _hidden,
      enableSuggestions: false,
      autocorrect: false,
      autofillHints: [
        widget.newPassword ? AutofillHints.newPassword : AutofillHints.password,
      ],
      validator: widget.validator,
      onFieldSubmitted: widget.onSubmitted,
      decoration: InputDecoration(
        labelText: widget.label,
        errorMaxLines: 5,
        suffixIcon: IconButton(
          tooltip: _hidden ? l.passwordShow : l.passwordHide,
          onPressed: () => setState(() => _hidden = !_hidden),
          icon: Icon(
            _hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
          ),
        ),
      ),
    );
  }
}

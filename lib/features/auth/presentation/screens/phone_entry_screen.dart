import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/localization/kaaj_localizations.dart';
import '../../../../core/localization/locale_controller.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/k_error_message.dart';
import '../../../../core/widgets/k_primary_button.dart';
import '../../../../core/widgets/k_trust_banner.dart';
import '../../../../l10n/generated/app_localizations.dart';
import '../../domain/usecases/auth_validators.dart';
import '../controllers/auth_controller.dart';
import '../controllers/auth_providers.dart';

class PhoneEntryScreen extends ConsumerStatefulWidget {
  const PhoneEntryScreen({super.key});

  @override
  ConsumerState<PhoneEntryScreen> createState() => _PhoneEntryScreenState();
}

class _PhoneEntryScreenState extends ConsumerState<PhoneEntryScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  bool _accepted = false;
  bool _submitted = false;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _submitted = true);
    if (!_formKey.currentState!.validate() || !_accepted) return;
    final phone = AuthValidators.normalizePhone(_phoneController.text);
    final challenge = await ref
        .read(authControllerProvider.notifier)
        .requestOtp(phone);
    if (!mounted || challenge == null) return;
    context.go(AppRoutes.otp, extra: challenge);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(authControllerProvider);
    final isLoading = state.status == AuthStatus.loading;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        actions: [
          PopupMenuButton<String>(
            tooltip: KaajLocalizations.text(context, 'অ্যাপের ভাষা'),
            icon: const Icon(Icons.language_rounded),
            onSelected: (value) => ref
                .read(localeControllerProvider.notifier)
                .setLocale(Locale(value)),
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'bn', child: Text('বাংলা')),
              PopupMenuItem(value: 'en', child: Text('English')),
            ],
          ),
          const SizedBox(width: KSpacing.sm),
        ],
      ),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              KSpacing.lg,
              KSpacing.md,
              KSpacing.lg,
              KSpacing.xl,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _CompactBrand(),
                    const SizedBox(height: KSpacing.xl),
                    Text(
                      l10n.phoneTitle,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: KColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: KSpacing.sm),
                    Text(
                      l10n.phoneSubtitle,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: KColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: KSpacing.lg),
                    TextFormField(
                      controller: _phoneController,
                      enabled: !isLoading,
                      style: const TextStyle(color: KColors.textPrimary),
                      cursorColor: KColors.primary,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp(r'[0-9+\- ()]'),
                        ),
                        LengthLimitingTextInputFormatter(18),
                      ],
                      decoration: InputDecoration(
                        labelText: l10n.phoneLabel,
                        hintText: l10n.phoneHint,
                        labelStyle: const TextStyle(
                          color: KColors.textSecondary,
                        ),
                        hintStyle: const TextStyle(
                          color: KColors.textSecondary,
                        ),
                        prefixIcon: const Icon(Icons.phone_outlined),
                      ),
                      validator: (value) =>
                          AuthValidators.isValidPhone(value ?? '')
                          ? null
                          : l10n.invalidPhone,
                      onChanged: (_) {
                        if (state.failure != null) {
                          ref
                              .read(authControllerProvider.notifier)
                              .clearError();
                        }
                      },
                      onFieldSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: KSpacing.sm),
                    const KTrustBanner(
                      message: 'আপনার নম্বর নিরাপদ থাকবে',
                      icon: Icons.shield_outlined,
                    ),
                    const SizedBox(height: KSpacing.md),
                    Card(
                      child: CheckboxListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: KSpacing.sm,
                        ),
                        controlAffinity: ListTileControlAffinity.leading,
                        value: _accepted,
                        onChanged: isLoading
                            ? null
                            : (value) {
                                if (state.failure != null) {
                                  ref
                                      .read(authControllerProvider.notifier)
                                      .clearError();
                                }
                                setState(() => _accepted = value ?? false);
                              },
                        title: Text(l10n.phoneConsent),
                      ),
                    ),
                    if (_submitted && !_accepted)
                      Padding(
                        padding: const EdgeInsets.only(bottom: KSpacing.md),
                        child: Text(
                          l10n.acceptTerms,
                          style: const TextStyle(color: KColors.danger),
                        ),
                      ),
                    if (state.failure != null) ...[
                      KErrorMessage(failure: state.failure!),
                      const SizedBox(height: KSpacing.md),
                    ],
                    const SizedBox(height: KSpacing.sm),
                    KPrimaryButton(
                      label: l10n.sendCode,
                      isLoading: isLoading,
                      onPressed: _submit,
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
}

class _CompactBrand extends StatelessWidget {
  const _CompactBrand();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: KColors.surfaceAlt,
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.handshake_rounded, color: KColors.primary),
        ),
        const SizedBox(width: KSpacing.sm),
        Text(
          'KAAJ',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: KColors.primary,
            letterSpacing: 1.5,
          ),
        ),
      ],
    );
  }
}

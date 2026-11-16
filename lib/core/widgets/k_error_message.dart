import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../errors/failure.dart';
import '../theme/app_theme.dart';

class KErrorMessage extends StatelessWidget {
  const KErrorMessage({required this.failure, super.key});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(KSpacing.md),
        decoration: BoxDecoration(
          color: KColors.danger.withValues(alpha: 0.08),
          border: Border.all(color: KColors.danger.withValues(alpha: 0.35)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.info_outline, color: KColors.danger),
                const SizedBox(width: KSpacing.sm),
                Expanded(
                  child: Text(
                    localizedFailureMessage(l10n, failure),
                    style: const TextStyle(
                      color: KColors.danger,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
            if (failure.requestId != null) ...[
              const SizedBox(height: KSpacing.sm),
              Text(
                l10n.requestReference(failure.requestId!),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The app's own message for a stable server error code the person can act
/// on, or null for codes the app has no specific copy for.
String? serverCodeMessage(AppLocalizations l10n, Failure failure) =>
    switch (failure.code) {
      'ACCOUNT_RESTRICTED' => l10n.errorAccountRestricted,
      'REVERIFICATION_REQUIRED' => l10n.errorReverificationRequired,
      'ACCOUNT_SUSPENDED' => l10n.errorAccountSuspended,
      'ACCOUNT_UNAVAILABLE' => l10n.errorAccountUnavailable,
      'SUBSCRIPTION_REQUIRED' => l10n.errorSubscriptionRequired,
      'USER_BLOCKED' => l10n.errorUserBlocked,
      'HIRING_UNAVAILABLE' => l10n.errorHiringUnavailable,
      'ALREADY_APPLIED' => l10n.errorAlreadyApplied,
      'PAYLOAD_TOO_LARGE' => l10n.errorPayloadTooLarge,
      'SERVICE_UNAVAILABLE' => l10n.errorServiceUnavailable,
      'CONCURRENT_UPDATE' => l10n.errorConcurrentUpdate,
      'RATE_LIMITED' => l10n.rateLimitedMessage,
      'SLOT_UNAVAILABLE' => l10n.errorSlotUnavailable,
      'DISPUTE_NOT_ELIGIBLE' => l10n.errorDisputeNotEligible,
      'DISPUTE_WINDOW_CLOSED' => l10n.errorDisputeWindowClosed,
      'DISPUTE_EXISTS' => l10n.errorDisputeExists,
      // Until the server sends SLOT_UNAVAILABLE it sends a plain CONFLICT
      // with this reason.
      'CONFLICT' when failure.message.contains('not available for this slot') =>
        l10n.errorSlotUnavailable,
      _ => switch (failure.kind) {
        FailureKind.network => l10n.offlineMessage,
        FailureKind.timeout => l10n.timeoutMessage,
        _ => null,
      },
    };

String localizedFailureMessage(AppLocalizations l10n, Failure failure) =>
    serverCodeMessage(l10n, failure) ??
    switch (failure.code) {
      'AUTH_INVALID_PHONE' => l10n.invalidPhone,
      'AUTH_INVALID_CREDENTIALS' => l10n.passwordInvalidCredentials,
      'PASSWORD_INVALID' => l10n.passwordRules,
      'PASSWORD_ALREADY_SET' => l10n.passwordAlreadySet,
      'PASSWORD_SUBSCRIPTION_REQUIRED' => l10n.passwordSubscriptionRequired,
      'AUTH_RATE_LIMITED' => l10n.rateLimitedMessage,
      'AUTH_UNSUPPORTED_OPERATOR' => l10n.unsupportedOperatorPhone,
      'OTP_INVALID' || 'AUTH_OTP_INVALID' => l10n.otpIncorrectMessage,
      'OTP_EXPIRED' || 'AUTH_OTP_EXPIRED' => l10n.codeExpired,
      'OTP_RATE_LIMITED' => l10n.rateLimitedMessage,
      'OTP_ATTEMPTS_EXCEEDED' ||
      'AUTH_OTP_ATTEMPTS_EXCEEDED' => l10n.otpAttemptsExceededMessage,
      'OPERATOR_SMS_UNAVAILABLE' => l10n.operatorSmsUnavailableMessage,
      'OTP_ALREADY_USED' => l10n.otpAlreadyUsedMessage,
      'OTP_CHALLENGE_NOT_FOUND' => l10n.otpNotFoundMessage,
      _ => switch (failure.kind) {
        FailureKind.network => l10n.offlineMessage,
        FailureKind.timeout => l10n.timeoutMessage,
        FailureKind.unauthorized => l10n.unauthorizedMessage,
        FailureKind.forbidden => l10n.forbiddenMessage,
        FailureKind.validation => l10n.validationMessage,
        FailureKind.notFound => l10n.notFoundMessage,
        FailureKind.conflict => l10n.conflictMessage,
        FailureKind.rateLimited => l10n.rateLimitedMessage,
        FailureKind.server || FailureKind.unknown => l10n.unexpectedMessage,
      },
    };

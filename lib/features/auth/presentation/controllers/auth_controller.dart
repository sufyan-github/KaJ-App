import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failure.dart';
import '../../domain/entities/otp_challenge.dart';
import '../../domain/repositories/auth_repository.dart';

enum AuthStatus { initial, loading, unauthenticated, codeSent, authenticated }

class AuthState {
  const AuthState({
    this.status = AuthStatus.initial,
    this.challenge,
    this.failure,
    this.isNewUser = false,
    this.accessChecked = true,
    this.subscriptionAccess = true,
    this.needsPasswordSetup = false,
    this.onboardingRequired = false,
    this.sessionExpired = false,
  });

  final AuthStatus status;
  final OtpChallenge? challenge;
  final Failure? failure;
  final bool isNewUser;
  final bool accessChecked;
  final bool subscriptionAccess;
  final bool needsPasswordSetup;

  /// The server says this account has not finished setting up (no name yet).
  /// Read on every sign-in and restore, so onboarding resumes after the app
  /// is killed half way, whatever this phone remembers.
  final bool onboardingRequired;

  /// The previous session ended because the server refused it, not because
  /// the person signed out. The sign-in screen explains that.
  final bool sessionExpired;

  AuthState copyWith({
    AuthStatus? status,
    OtpChallenge? challenge,
    Failure? failure,
    bool clearFailure = false,
    bool? isNewUser,
    bool? accessChecked,
    bool? subscriptionAccess,
    bool? needsPasswordSetup,
    bool? onboardingRequired,
  }) {
    return AuthState(
      status: status ?? this.status,
      challenge: challenge ?? this.challenge,
      failure: clearFailure ? null : failure ?? this.failure,
      isNewUser: isNewUser ?? this.isNewUser,
      accessChecked: accessChecked ?? this.accessChecked,
      subscriptionAccess: subscriptionAccess ?? this.subscriptionAccess,
      needsPasswordSetup: needsPasswordSetup ?? this.needsPasswordSetup,
      onboardingRequired: onboardingRequired ?? this.onboardingRequired,
    );
  }
}

/// Runs when a signed-in session ends, to remove that person's data.
typedef SignedOutCallback = Future<void> Function();

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repository, {this._onSignedOut})
    : super(const AuthState());

  final AuthRepository _repository;
  final SignedOutCallback? _onSignedOut;

  Future<bool> restoreSession() async {
    state = state.copyWith(status: AuthStatus.loading, clearFailure: true);
    try {
      final restored = await _repository.restoreSession();
      if (!mounted) return false;
      // No usable session on this phone: nothing stored here may belong to
      // whoever signs in next.
      if (!restored) await _clearUserData();
      if (!mounted) return false;
      state = state.copyWith(
        status: restored
            ? AuthStatus.authenticated
            : AuthStatus.unauthenticated,
        accessChecked: !restored,
      );
      return restored;
    } on Object catch (error) {
      if (mounted) state = AuthState(failure: ErrorMapper.from(error));
      return false;
    }
  }

  Future<OtpChallenge?> requestOtp(String phone) async {
    state = state.copyWith(status: AuthStatus.loading, clearFailure: true);
    try {
      final challenge = await _repository.requestOtp(phone);
      state = state.copyWith(status: AuthStatus.codeSent, challenge: challenge);
      return challenge;
    } on Failure catch (failure) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        failure: failure,
      );
      return null;
    }
  }

  Future<bool> verifyOtp(OtpChallenge challenge, String code) async {
    state = state.copyWith(status: AuthStatus.loading, clearFailure: true);
    try {
      final result = await _repository.verifyOtp(
        challenge: challenge,
        code: code,
      );
      state = state.copyWith(
        status: AuthStatus.authenticated,
        isNewUser: result.isNewUser,
        accessChecked: false,
      );
      return true;
    } on Failure catch (failure) {
      state = state.copyWith(status: AuthStatus.codeSent, failure: failure);
      return false;
    }
  }

  Future<void> logout() async {
    state = state.copyWith(status: AuthStatus.loading, clearFailure: true);
    try {
      await _repository.logout();
    } finally {
      await _clearUserData();
      if (mounted) state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  /// The server refused the session (revoked, signed out everywhere, or the
  /// password was reset). The tokens are already gone; drop this person's
  /// data and send them to sign-in with an explanation.
  Future<void> sessionExpired() async {
    if (state.status == AuthStatus.unauthenticated ||
        state.status == AuthStatus.initial) {
      return;
    }
    await _clearUserData();
    if (!mounted) return;
    state = const AuthState(
      status: AuthStatus.unauthenticated,
      sessionExpired: true,
    );
  }

  void passwordLoginSucceeded() {
    state = const AuthState(
      status: AuthStatus.authenticated,
      accessChecked: false,
    );
  }

  void passwordRecoverySucceeded() {
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void resolveAccess({
    required bool allowed,
    required bool needsPassword,
    bool? onboardingRequired,
  }) {
    state = state.copyWith(
      accessChecked: true,
      subscriptionAccess: allowed,
      needsPasswordSetup: needsPassword,
      onboardingRequired: onboardingRequired,
    );
  }

  void recheckAccess() => state = state.copyWith(accessChecked: false);

  /// Onboarding finished on this phone; stop routing back into it.
  void onboardingFinished() =>
      state = state.copyWith(isNewUser: false, onboardingRequired: false);

  void passwordConfigured() =>
      state = state.copyWith(needsPasswordSetup: false);

  Future<void> logoutAll() async {
    state = state.copyWith(status: AuthStatus.loading, clearFailure: true);
    try {
      await _repository.logoutAll();
    } finally {
      await _clearUserData();
      if (mounted) state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  void clearError() => state = state.copyWith(clearFailure: true);

  Future<void> _clearUserData() async {
    try {
      await _onSignedOut?.call();
    } on Object {
      // Sign-out must still finish if local storage misbehaves.
    }
  }
}

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
  });

  final AuthStatus status;
  final OtpChallenge? challenge;
  final Failure? failure;
  final bool isNewUser;
  final bool accessChecked;
  final bool subscriptionAccess;
  final bool needsPasswordSetup;

  AuthState copyWith({
    AuthStatus? status,
    OtpChallenge? challenge,
    Failure? failure,
    bool clearFailure = false,
    bool? isNewUser,
    bool? accessChecked,
    bool? subscriptionAccess,
    bool? needsPasswordSetup,
  }) {
    return AuthState(
      status: status ?? this.status,
      challenge: challenge ?? this.challenge,
      failure: clearFailure ? null : failure ?? this.failure,
      isNewUser: isNewUser ?? this.isNewUser,
      accessChecked: accessChecked ?? this.accessChecked,
      subscriptionAccess: subscriptionAccess ?? this.subscriptionAccess,
      needsPasswordSetup: needsPasswordSetup ?? this.needsPasswordSetup,
    );
  }
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repository) : super(const AuthState());

  final AuthRepository _repository;

  Future<bool> restoreSession() async {
    state = state.copyWith(status: AuthStatus.loading, clearFailure: true);
    try {
      final restored = await _repository.restoreSession();
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
    await _repository.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
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

  void resolveAccess({required bool allowed, required bool needsPassword}) {
    state = state.copyWith(
      accessChecked: true,
      subscriptionAccess: allowed,
      needsPasswordSetup: needsPassword,
    );
  }

  void recheckAccess() => state = state.copyWith(accessChecked: false);

  void passwordConfigured() =>
      state = state.copyWith(needsPasswordSetup: false);

  Future<void> logoutAll() async {
    state = state.copyWith(status: AuthStatus.loading, clearFailure: true);
    try {
      await _repository.logoutAll();
    } finally {
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  void clearError() => state = state.copyWith(clearFailure: true);
}

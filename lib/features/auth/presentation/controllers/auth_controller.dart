import 'package:flutter_riverpod/flutter_riverpod.dart';

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
  });

  final AuthStatus status;
  final OtpChallenge? challenge;
  final Failure? failure;
  final bool isNewUser;

  AuthState copyWith({
    AuthStatus? status,
    OtpChallenge? challenge,
    Failure? failure,
    bool clearFailure = false,
    bool? isNewUser,
  }) {
    return AuthState(
      status: status ?? this.status,
      challenge: challenge ?? this.challenge,
      failure: clearFailure ? null : failure ?? this.failure,
      isNewUser: isNewUser ?? this.isNewUser,
    );
  }
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repository) : super(const AuthState());

  final AuthRepository _repository;

  Future<bool> restoreSession() async {
    state = state.copyWith(status: AuthStatus.loading, clearFailure: true);
    final restored = await _repository.restoreSession();
    state = state.copyWith(
      status: restored ? AuthStatus.authenticated : AuthStatus.unauthenticated,
    );
    return restored;
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

  void clearError() => state = state.copyWith(clearFailure: true);
}

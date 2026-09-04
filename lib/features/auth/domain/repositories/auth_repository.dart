import '../entities/auth_result.dart';
import '../entities/otp_challenge.dart';

abstract interface class AuthRepository {
  Future<OtpChallenge> requestOtp(String phone);

  Future<AuthResult> verifyOtp({
    required OtpChallenge challenge,
    required String code,
  });

  Future<bool> restoreSession();

  Future<void> logout();

  Future<void> logoutAll();
}

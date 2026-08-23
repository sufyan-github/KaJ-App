import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/features/auth/domain/entities/auth_result.dart';
import 'package:kaaj/features/auth/domain/entities/otp_challenge.dart';
import 'package:kaaj/features/auth/domain/repositories/auth_repository.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';

void main() {
  late _FakeAuthRepository repository;
  late AuthController controller;

  setUp(() {
    repository = _FakeAuthRepository();
    controller = AuthController(repository);
  });

  test('restores an existing rotating-token session', () async {
    repository.hasSession = true;

    expect(await controller.restoreSession(), isTrue);
    expect(controller.state.status, AuthStatus.authenticated);
  });

  test('requests and verifies an OTP challenge', () async {
    final challenge = await controller.requestOtp('+8801712345678');

    expect(challenge, isNotNull);
    expect(controller.state.status, AuthStatus.codeSent);

    expect(await controller.verifyOtp(challenge!, '123456'), isTrue);
    expect(controller.state.status, AuthStatus.authenticated);
    expect(controller.state.isNewUser, isTrue);
  });

  test('logout clears the authenticated state', () async {
    repository.hasSession = true;
    await controller.restoreSession();

    await controller.logout();

    expect(repository.logoutCalled, isTrue);
    expect(controller.state.status, AuthStatus.unauthenticated);
  });
}

class _FakeAuthRepository implements AuthRepository {
  bool hasSession = false;
  bool logoutCalled = false;

  @override
  Future<void> logout() async {
    logoutCalled = true;
    hasSession = false;
  }

  @override
  Future<OtpChallenge> requestOtp(String phone) async {
    return OtpChallenge(
      id: '5c24b335-3c2a-4f6f-a37a-237d6f5644d0',
      phone: phone,
      expiresInSeconds: 300,
    );
  }

  @override
  Future<bool> restoreSession() async => hasSession;

  @override
  Future<AuthResult> verifyOtp({
    required OtpChallenge challenge,
    required String code,
  }) async {
    hasSession = true;
    return const AuthResult(isNewUser: true);
  }
}

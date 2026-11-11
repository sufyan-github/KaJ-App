import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/storage/session_token_store.dart';
import 'package:kaaj/features/auth/data/datasources/auth_remote_data_source.dart';
import 'package:kaaj/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:kaaj/features/auth/domain/entities/otp_challenge.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/fake_api.dart';

class _Tokens extends Mock implements SessionTokenStore {}

void main() {
  const challenge = OtpChallenge(
    id: 'challenge-id',
    phone: '+8801812345678',
    expiresInSeconds: 3600,
  );

  AuthRepositoryImpl repositoryFor(FakeApi api) {
    final tokens = _Tokens();
    when(tokens.getOrCreateDeviceId).thenAnswer((_) async => 'device-id');
    return AuthRepositoryImpl(AuthRemoteDataSource(api.dio()), tokens);
  }

  Future<Failure> failureOf(Future<Object?> call) => call.then<Failure>(
    (_) => fail('Expected a Failure'),
    onError: (Object error) => error as Failure,
  );

  for (final (status, code, kind) in [
    (422, 'OTP_INVALID', FailureKind.validation),
    (422, 'OTP_EXPIRED', FailureKind.validation),
    (422, 'AUTH_OTP_EXPIRED', FailureKind.validation),
    (429, 'OTP_ATTEMPTS_EXCEEDED', FailureKind.rateLimited),
  ]) {
    test('verify keeps the $code code for localized copy', () async {
      final api = FakeApi()
        ..on('POST /auth/otp/verify', FakeResponse.error(status, code));

      final failure = await failureOf(
        repositoryFor(api).verifyOtp(challenge: challenge, code: '123456'),
      );

      expect(failure.code, code);
      expect(failure.kind, kind);
    });
  }

  test('request maps an unavailable carrier SMS route', () async {
    final api = FakeApi()
      ..on(
        'POST /auth/otp/request',
        FakeResponse.error(503, 'OPERATOR_SMS_UNAVAILABLE'),
      );

    final failure = await failureOf(
      repositoryFor(api).requestOtp('+8801812345678'),
    );

    expect(failure.code, 'OPERATOR_SMS_UNAVAILABLE');
    expect(failure.kind, FailureKind.server);
    expect(failure.retryable, isTrue);
  });
}

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaaj/core/errors/failure.dart';
import 'package:kaaj/core/storage/session_token_store.dart';
import 'package:kaaj/features/auth/data/datasources/auth_remote_data_source.dart';
import 'package:kaaj/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';
import 'package:mocktail/mocktail.dart';

class _Remote extends Mock implements AuthRemoteDataSource {}

class _Tokens extends Mock implements SessionTokenStore {}

void main() {
  for (final status in [401, 503]) {
    test(
      'session restore handles HTTP $status without silent data loss',
      () async {
        final remote = _Remote();
        final tokens = _Tokens();
        when(() => tokens.readRefreshToken()).thenAnswer((_) async => 'saved');
        when(() => tokens.clearSession()).thenAnswer((_) async {});
        final request = RequestOptions(path: '/auth/refresh');
        when(() => remote.refresh('saved')).thenThrow(
          DioException(
            requestOptions: request,
            type: DioExceptionType.badResponse,
            response: Response(requestOptions: request, statusCode: status),
          ),
        );
        final repo = AuthRepositoryImpl(remote, tokens);
        if (status == 401) {
          expect(await repo.restoreSession(), isFalse);
          verify(() => tokens.clearSession()).called(1);
        } else {
          await expectLater(repo.restoreSession(), throwsA(isA<Failure>()));
          verifyNever(() => tokens.clearSession());
          final controller = AuthController(repo);
          expect(await controller.restoreSession(), isFalse);
          expect(controller.state.status, AuthStatus.initial);
          expect(controller.state.failure, isNotNull);
          controller.dispose();
        }
      },
    );
  }
}

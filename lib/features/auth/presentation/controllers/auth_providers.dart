import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../../bootstrap.dart';
import '../../../../core/localization/locale_controller.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_locale.dart';
import '../../../../core/storage/session_token_store.dart';
import '../../data/datasources/auth_remote_data_source.dart';
import '../../data/repositories/auth_repository_impl.dart';
import '../../data/repositories/password_repository.dart';
import '../../domain/repositories/auth_repository.dart';
import 'auth_controller.dart';

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => const FlutterSecureStorage(),
);

final sessionTokenStoreProvider = Provider<SessionTokenStore>(
  (ref) => SessionTokenStore(ref.watch(secureStorageProvider)),
);

/// Carries the active language into every request header.
///
/// This provider never rebuilds: it reads the locale once and then *listens*
/// for changes, mutating the holder in place. That is what keeps `dioProvider`
/// stable across a language switch — watching the locale here would rebuild
/// Dio, and with it the auth controller and every repository cache below it.
final apiLocaleProvider = Provider<ApiLocale>((ref) {
  final apiLocale = ApiLocale(ref.read(localeControllerProvider).languageCode);
  ref.listen<Locale>(
    localeControllerProvider,
    (_, next) => apiLocale.languageCode = next.languageCode,
  );
  return apiLocale;
});

final dioProvider = Provider<Dio>((ref) {
  return ApiClient(
    environment: ref.watch(appEnvironmentProvider),
    tokenStore: ref.watch(sessionTokenStoreProvider),
    locale: ref.watch(apiLocaleProvider),
  ).dio;
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepositoryImpl(
    AuthRemoteDataSource(ref.watch(dioProvider)),
    ref.watch(sessionTokenStoreProvider),
  );
});

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) {
    return AuthController(ref.watch(authRepositoryProvider));
  },
);

final passwordRepositoryProvider = Provider<PasswordRepository>(
  (ref) => PasswordRepository(
    ref.watch(dioProvider),
    ref.watch(sessionTokenStoreProvider),
  ),
);

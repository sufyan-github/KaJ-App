import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../../bootstrap.dart';
import '../../../../core/localization/locale_controller.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/storage/session_token_store.dart';
import '../../data/datasources/auth_remote_data_source.dart';
import '../../data/repositories/auth_repository_impl.dart';
import '../../domain/repositories/auth_repository.dart';
import 'auth_controller.dart';

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => const FlutterSecureStorage(),
);

final sessionTokenStoreProvider = Provider<SessionTokenStore>(
  (ref) => SessionTokenStore(ref.watch(secureStorageProvider)),
);

final dioProvider = Provider<Dio>((ref) {
  final locale = ref.watch(localeControllerProvider);
  return ApiClient(
    environment: ref.watch(appEnvironmentProvider),
    tokenStore: ref.watch(sessionTokenStoreProvider),
    localeCode: locale.languageCode,
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

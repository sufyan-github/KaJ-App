import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/core/config/app_environment.dart';
import 'package:kaaj/core/network/api_client.dart';
import 'package:kaaj/core/routing/app_router.dart';
import 'package:kaaj/core/session/user_session.dart';
import 'package:kaaj/core/storage/session_token_store.dart';
import 'package:kaaj/core/theme/app_theme.dart';
import 'package:kaaj/features/auth/domain/repositories/auth_repository.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_controller.dart';
import 'package:kaaj/features/auth/presentation/controllers/auth_providers.dart';
import 'package:kaaj/features/auth/presentation/screens/password_screens.dart';
import 'package:kaaj/features/chat/data/chat_realtime_service.dart';
import 'package:kaaj/features/chat/data/chat_repository.dart';
import 'package:kaaj/features/home/presentation/screens/home_screen.dart';
import 'package:kaaj/features/notifications/domain/app_notification.dart';
import 'package:kaaj/features/notifications/presentation/controllers/notifications_providers.dart';
import 'package:kaaj/features/onboarding/data/onboarding_repository.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/onboarding/presentation/controllers/onboarding_controller.dart';
import 'package:kaaj/features/profile/presentation/controllers/me_provider.dart';
import 'package:kaaj/l10n/generated/app_localizations.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/fake_api.dart';
import '../../support/pump_app.dart';

class _AuthRepository extends Mock implements AuthRepository {}

/// The server's view of a person, as `/auth/session` and `/profiles/me`
/// return it.
void serveAccount(
  FakeApi api, {
  required String userId,
  required String role,
  String displayName = 'Rahim',
  String? areaId = 'area-1',
}) {
  api
    ..on(
      'GET /auth/session',
      FakeResponse.data({
        'user': {
          'id': userId,
          'phoneE164': '+8801812345678',
          'activeRole': role,
          'roles': [role],
        },
        'flags': <String, bool>{},
      }),
    )
    ..on(
      'GET /profiles/me',
      FakeResponse.data({
        'displayName': displayName,
        'bio': null,
        'primaryLocation': areaId == null
            ? null
            : {'id': areaId, 'nameEn': 'Boalia', 'nameBn': 'বোয়ালিয়া'},
        'photoUrl': null,
        'trustLevel': 'PHONE',
        'roles': [role],
        'activeRole': role,
        'skills': <Object>[],
        'certificates': <Object>[],
        'completeness': {'percent': 60, 'missing': <String>[]},
      }),
    );
}

void main() {
  late Directory directory;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('kaaj-session-');
    Hive.init(directory.path);
    await Hive.openBox<dynamic>(onboardingBoxName);
    await Hive.openBox<dynamic>(chatBoxName);
  });

  tearDown(() async {
    await Hive.close();
    await directory.delete(recursive: true);
  });

  /// Leaves a previous person's worker draft and an unsent chat message on
  /// the phone, as a shared phone would have.
  Future<void> leavePreviousPersonsData() async {
    await Hive.box<dynamic>(onboardingBoxName).put(
      'draft',
      const OnboardingState(
        started: true,
        complete: true,
        step: 6,
        displayName: 'Previous person',
        role: KaajRole.worker,
        locationId: 'their-area',
      ).toJson(),
    );
    await Hive.box<dynamic>(chatBoxName).put('pending:conv-1', [
      {'body': 'private text'},
    ]);
  }

  ProviderContainer containerWith(List<Override> overrides) {
    final container = ProviderContainer(overrides: overrides);
    addTearDown(container.dispose);
    return container;
  }

  test(
    'a revoked session sends the person to sign-in and clears their data',
    () async {
      await leavePreviousPersonsData();
      final tokens = _MemoryTokenStore(access: 'old', refresh: 'revoked');
      final adapter = _AlwaysUnauthorized();
      final client = ApiClient(
        environment: const AppEnvironment(
          flavor: AppFlavor.dev,
          apiBaseUrl: 'https://kaaj.test/api/v1',
          sentryDsn: '',
        ),
        tokenStore: tokens,
        httpClientAdapter: adapter,
      );
      final container = containerWith([
        sessionTokenStoreProvider.overrideWithValue(tokens),
        dioProvider.overrideWithValue(client.dio),
        authRepositoryProvider.overrideWithValue(_AuthRepository()),
      ]);
      container.read(authControllerProvider.notifier)
        ..passwordLoginSucceeded()
        ..resolveAccess(allowed: true, needsPassword: false);
      expect(
        container.read(onboardingControllerProvider).role,
        KaajRole.worker,
      );
      final epoch = container.read(sessionEpochProvider);

      await expectLater(
        client.dio.get<Object>('/jobs'),
        throwsA(isA<DioException>()),
      );
      // Clearing the boxes is real disk I/O; wait for it, with a bound.
      for (var i = 0; i < 200; i++) {
        if (container.read(authControllerProvider).status ==
            AuthStatus.unauthenticated) {
          break;
        }
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }

      final auth = container.read(authControllerProvider);
      expect(auth.status, AuthStatus.unauthenticated);
      expect(auth.sessionExpired, isTrue);
      expect(authRedirect(auth, AppRoutes.home), AppRoutes.phone);
      expect(adapter.paths, ['/jobs', '/auth/refresh']);
      expect(tokens.accessToken, isNull);
      expect(Hive.box<dynamic>(onboardingBoxName).isEmpty, isTrue);
      expect(Hive.box<dynamic>(chatBoxName).isEmpty, isTrue);
      expect(container.read(sessionEpochProvider), epoch + 1);
      expect(container.read(onboardingControllerProvider).role, isNull);
    },
  );

  for (final language in ['en', 'bn']) {
    testWidgets('sign-in explains that the session ended in $language', (
      tester,
    ) async {
      final controller = AuthController(_AuthRepository())
        ..passwordLoginSucceeded();
      await controller.sessionExpired();
      final router = GoRouter(
        routes: [
          GoRoute(path: '/', builder: (_, _) => const PasswordLoginScreen()),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [authControllerProvider.overrideWith((ref) => controller)],
          child: MaterialApp.router(
            routerConfig: router,
            theme: buildAppTheme(),
            locale: Locale(language),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining(
          language == 'en' ? 'Your session has ended' : 'আপনার সেশন শেষ হয়েছে',
        ),
        findsOneWidget,
      );
    });
  }

  test('a password reset while signed in clears the local data', () async {
    var cleared = 0;
    final controller = AuthController(
      _AuthRepository(),
      onSignedOut: () async => cleared++,
    )..passwordLoginSucceeded();
    await controller.passwordRecoverySucceeded();
    expect(controller.state.status, AuthStatus.unauthenticated);
    expect(cleared, 1);
    // Recovering from the sign-in screen has nothing of anyone to clear.
    await controller.passwordRecoverySucceeded();
    expect(cleared, 1);
  });

  test('sign-out cleanup also empties the image caches', () async {
    var images = 0;
    await UserDataCleaner(const [], clearImages: () async => images++).clear();
    expect(images, 1);
    // A failing image cache never blocks the sign-out.
    await UserDataCleaner(
      const [],
      clearImages: () async => throw StateError('disk'),
    ).clear();
  });

  test('logout then a new account sees only its own data', () async {
    await leavePreviousPersonsData();
    final api = FakeApi();
    serveAccount(api, userId: 'worker-a', role: 'WORKER');
    final repository = _AuthRepository();
    when(repository.logout).thenAnswer((_) async {});
    final container = containerWith([
      dioProvider.overrideWithValue(api.dio()),
      authRepositoryProvider.overrideWithValue(repository),
    ]);
    final auth = container.read(authControllerProvider.notifier)
      ..passwordLoginSucceeded()
      ..resolveAccess(allowed: true, needsPassword: false);
    final first = await container.read(meProvider.future);
    expect(first.userId, 'worker-a');
    expect(first.isWorker, isTrue);

    await auth.logout();

    expect(
      container.read(authControllerProvider).status,
      AuthStatus.unauthenticated,
    );
    expect(Hive.box<dynamic>(onboardingBoxName).isEmpty, isTrue);
    expect(Hive.box<dynamic>(chatBoxName).isEmpty, isTrue);

    // Someone else signs in on the same phone.
    serveAccount(
      api,
      userId: 'customer-b',
      role: 'CUSTOMER',
      displayName: '',
      areaId: null,
    );
    auth.passwordLoginSucceeded();
    final second = await container.read(meProvider.future);
    expect(second.userId, 'customer-b');
    expect(second.isWorker, isFalse);
    expect(second.areaId, isNull);
    expect(second.onboardingRequired, isTrue);
    final draft = container.read(onboardingControllerProvider);
    expect(draft.role, isNull);
    expect(draft.displayName, isEmpty);
    expect(draft.started, isFalse);
  });

  group('onboarding follows the server', () {
    test('an unfinished account resumes onboarding after an app kill', () {
      // After a restart isNewUser is gone; only the server flag remains.
      const auth = AuthState(
        status: AuthStatus.authenticated,
        onboardingRequired: true,
      );
      expect(authRedirect(auth, AppRoutes.home), AppRoutes.onboardingProfile);
      expect(
        authRedirect(
          auth,
          AppRoutes.home,
          onboarding: const OnboardingState(
            started: true,
            step: 2,
            role: KaajRole.worker,
          ),
        ),
        AppRoutes.onboardingLocation,
      );
    });

    test('a returning person with no draft on this phone goes home', () {
      const auth = AuthState(status: AuthStatus.authenticated);
      expect(authRedirect(auth, AppRoutes.splash), AppRoutes.home);
    });

    testWidgets('the access check reads onboardingRequired from the server', (
      tester,
    ) async {
      final api = FakeApi()
        ..on(
          'GET /auth/password/status',
          FakeResponse.data({'hasPassword': true}),
        )
        ..on(
          'GET /subscriptions/me',
          FakeResponse.data({'accessActive': true}),
        );
      serveAccount(api, userId: 'new-user', role: 'CUSTOMER', displayName: '');
      final controller = AuthController(_AuthRepository())
        ..passwordLoginSucceeded();
      final router = GoRouter(
        initialLocation: AppRoutes.accessCheck,
        routes: [
          GoRoute(
            path: AppRoutes.accessCheck,
            builder: (_, _) => const AuthAccessScreen(),
          ),
          GoRoute(
            path: AppRoutes.home,
            builder: (_, _) => const Scaffold(body: Text('home')),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            dioProvider.overrideWithValue(api.dio()),
            authControllerProvider.overrideWith((ref) => controller),
          ],
          child: MaterialApp.router(
            routerConfig: router,
            locale: const Locale('en'),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(controller.state.accessChecked, isTrue);
      expect(controller.state.onboardingRequired, isTrue);
      expect(
        authRedirect(controller.state, AppRoutes.home),
        AppRoutes.onboardingProfile,
      );
    });
  });

  testWidgets('a returning worker on a new phone gets the worker home', (
    tester,
  ) async {
    // A new phone: no onboarding draft at all.
    final api = FakeApi();
    serveAccount(api, userId: 'worker-a', role: 'WORKER');
    await pumpRouted(
      tester,
      api: api,
      home: const HomeScreen(),
      overrides: [
        onboardingControllerProvider.overrideWith(
          (ref) => OnboardingController(
            OnboardingRepository(
              api.dio(),
              Hive.box<dynamic>(onboardingBoxName),
            ),
          ),
        ),
        notificationsProvider.overrideWith(
          (ref) async => const NotificationInbox(items: [], unreadCount: 0),
        ),
      ],
    );

    expect(find.text('Search work'), findsOneWidget);
    expect(find.text('What work do you need done?'), findsNothing);
    expect(api.called('GET /profiles/me'), isNotEmpty);
  });

  group('chat socket token recovery', () {
    test('uses a token the HTTP layer already rotated', () async {
      final tokens = _MemoryTokenStore(access: 'new', refresh: 'r');
      final recovery = ChatTokenRecovery(tokens);
      expect(await recovery.tokenAfterRejection('old'), 'new');
      expect(tokens.refreshes, 0);
    });

    test('refreshes a stale token before reconnecting', () async {
      final tokens = _MemoryTokenStore(access: 'stale', refresh: 'r')
        ..nextAccess = 'fresh';
      final recovery = ChatTokenRecovery(tokens);
      expect(await recovery.tokenAfterRejection('stale'), 'fresh');
      expect(tokens.refreshes, 1);
    });

    test('gives up after repeated refusals until a handshake works', () async {
      final tokens = _MemoryTokenStore(access: 'a', refresh: 'r');
      final recovery = ChatTokenRecovery(tokens, maxAttempts: 2);
      tokens.nextAccess = 'b';
      expect(await recovery.tokenAfterRejection('a'), 'b');
      tokens.nextAccess = 'c';
      expect(await recovery.tokenAfterRejection('b'), 'c');
      expect(await recovery.tokenAfterRejection('c'), isNull);
      recovery.accepted();
      tokens.nextAccess = 'd';
      expect(await recovery.tokenAfterRejection('c'), 'd');
    });

    test('stops when the session cannot be renewed', () async {
      final tokens = _MemoryTokenStore(access: 'a', refresh: 'r')
        ..nextAccess = null;
      expect(await ChatTokenRecovery(tokens).tokenAfterRejection('a'), isNull);
    });
  });
}

class _MemoryTokenStore extends SessionTokenStore {
  _MemoryTokenStore({String? access, String? refresh})
    : super(const FlutterSecureStorage()) {
    _access = access;
    _refresh = refresh;
  }

  String? _access;
  String? _refresh;
  String? nextAccess = 'refreshed';
  int refreshes = 0;

  @override
  String? get accessToken => _access;

  @override
  Future<String?> readRefreshToken() async => _refresh;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    _access = accessToken;
    _refresh = refreshToken;
  }

  @override
  Future<void> clearSession() async {
    _access = null;
    _refresh = null;
  }

  @override
  Future<String?> refreshAccessToken() async {
    if (_refresh == null) return super.refreshAccessToken();
    refreshes++;
    if (nextAccess != null) _access = nextAccess;
    return nextAccess;
  }
}

/// A server that has revoked the session: every call, refresh included, is
/// refused.
class _AlwaysUnauthorized implements HttpClientAdapter {
  final paths = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    paths.add(options.path);
    return ResponseBody.fromString(
      jsonEncode({
        'error': {'code': 'AUTH_SESSION_REVOKED', 'message': 'Revoked'},
      }),
      401,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

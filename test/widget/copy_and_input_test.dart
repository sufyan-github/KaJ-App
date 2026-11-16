import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce_flutter/hive_flutter.dart';
import 'package:kaaj/core/config/app_environment.dart';
import 'package:kaaj/core/connectivity/connectivity_service.dart';
import 'package:kaaj/core/formatting/latin_digits_formatter.dart';
import 'package:kaaj/core/localization/kaaj_localizations.dart';
import 'package:kaaj/core/storage/session_token_store.dart';
import 'package:kaaj/features/auth/domain/usecases/auth_validators.dart';
import 'package:kaaj/features/chat/data/chat_realtime_service.dart';
import 'package:kaaj/features/chat/data/chat_repository.dart';
import 'package:kaaj/features/chat/domain/chat_models.dart';
import 'package:kaaj/features/chat/presentation/controllers/chat_providers.dart';
import 'package:kaaj/features/chat/presentation/screens/chat_screens.dart';
import 'package:kaaj/features/home/presentation/screens/home_screen.dart';
import 'package:kaaj/features/notifications/domain/app_notification.dart';
import 'package:kaaj/features/notifications/presentation/controllers/notifications_providers.dart';
import 'package:kaaj/features/onboarding/domain/onboarding_state.dart';
import 'package:kaaj/features/onboarding/presentation/controllers/onboarding_controller.dart';
import 'package:kaaj/features/onboarding/presentation/screens/onboarding_screens.dart';
import 'package:mocktail/mocktail.dart';

import '../features/profile/my_profile_repository_test.dart' show myProfileJson;
import '../support/fake_api.dart';
import '../support/pump_app.dart';

class _QuietRealtime extends ChatRealtimeService {
  _QuietRealtime()
    : super(
        const AppEnvironment(
          flavor: AppFlavor.dev,
          apiBaseUrl: 'https://kaaj.test/api/v1',
          sentryDsn: '',
        ),
        SessionTokenStore(const FlutterSecureStorage()),
      );

  @override
  Stream<ChatMessage> get messages => const Stream.empty();

  @override
  void connect(String conversationId) {}
}

class _Offline extends ConnectivityService {
  _Offline() : super(Connectivity(), probe: () async => false);

  @override
  Future<bool> isOnline() async => false;

  @override
  Stream<bool> get changes => const Stream.empty();
}

class _MemoryBox implements Box<dynamic> {
  final data = <dynamic, dynamic>{};

  @override
  dynamic get(dynamic key, {dynamic defaultValue}) => data[key] ?? defaultValue;

  @override
  Future<void> put(dynamic key, dynamic value) async => data[key] = value;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  setUpAll(() => registerFallbackValue(const OnboardingState()));

  group('N9: blocking from chat', () {
    Future<FakeApi> openThread(WidgetTester tester) async {
      final api = FakeApi()
        ..on(
          'GET /conversations/conv-1/messages',
          FakeResponse.data({'items': <Object>[]}),
        )
        ..on('POST /conversations/conv-1/read', FakeResponse.data({}))
        ..on('POST /users/other/block', FakeResponse.data({}))
        ..on('GET /conversations', FakeResponse.data({'items': <Object>[]}));
      await pumpRouted(
        tester,
        api: api,
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const ChatThreadScreen(
                    conversationId: 'conv-1',
                    otherName: 'Karim',
                    otherUserId: 'other',
                  ),
                ),
              ),
              child: const Text('open'),
            ),
          ),
        ),
        overrides: [
          chatRepositoryProvider.overrideWithValue(
            ChatRepository(api.dio(), _MemoryBox()),
          ),
          chatRealtimeProvider.overrideWith((ref) => _QuietRealtime()),
          connectivityServiceProvider.overrideWithValue(_Offline()),
        ],
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      await tester.tap(
        find.text(
          KaajLocalizations.forLanguage('en', 'ব্যবহারকারীকে ব্লক করুন'),
        ),
      );
      await tester.pumpAndSettle();
      return api;
    }

    testWidgets('asks first, then blocks and says so', (tester) async {
      final api = await openThread(tester);
      expect(find.text('Block Karim?'), findsOneWidget);
      expect(api.called('POST /users/other/block'), isEmpty);

      await tester.tap(find.text('Block'));
      await tester.pumpAndSettle();
      expect(api.called('POST /users/other/block'), hasLength(1));
      expect(
        find.text('Blocked. You can unblock them in Settings.'),
        findsOneWidget,
      );
      // Back on the screen the thread was opened from.
      expect(find.text('open'), findsOneWidget);
    });

    testWidgets('cancelling does not block', (tester) async {
      final api = await openThread(tester);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(api.called('POST /users/other/block'), isEmpty);
      expect(find.text('Block Karim?'), findsNothing);
    });
  });

  group('N11: digits match the language', () {
    test('Bangla digits become Latin for numeric input', () {
      expect(latinDigits('০১৮১২৩৪৫৬৭৮'), '01812345678');
      expect(latinDigits('৫০০ টাকা'), '500 টাকা');
      expect(AuthValidators.isValidOtp('১২৩৪৫৬'), isTrue);
      expect(AuthValidators.normalizePhone('০১৮১২৩৪৫৬৭৮'), '+8801812345678');
      expect(AuthValidators.isSupportedOperatorPhone('০১৬১২৩৪৫৬৭৮'), isTrue);
      const formatter = LatinDigitsFormatter();
      final value = formatter.formatEditUpdate(
        TextEditingValue.empty,
        const TextEditingValue(
          text: '৪২',
          selection: TextSelection.collapsed(offset: 2),
        ),
      );
      expect(value.text, '42');
      expect(value.selection.baseOffset, 2);
    });

    for (final language in ['bn', 'en']) {
      testWidgets('the onboarding step number is in $language digits', (
        tester,
      ) async {
        await pumpRouted(
          tester,
          api: FakeApi(),
          home: const ProfileSetupScreen(),
          locale: Locale(language),
          overrides: [
            onboardingControllerProvider.overrideWith(
              (ref) => onboardingFor(KaajRole.customer, complete: false),
            ),
          ],
        );
        expect(
          find.text(language == 'bn' ? 'ধাপ ১ / ৫' : 'Step 1 / 5'),
          findsOneWidget,
        );
      });
    }
  });

  group('N10: copy', () {
    test('"Later" is not "after"', () {
      expect(KaajLocalizations.forLanguage('en', 'পরে'), 'Later');
    });

    testWidgets('a client is not told to find work on the first tour page', (
      tester,
    ) async {
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: const OnboardingTourScreen(),
        overrides: [
          onboardingControllerProvider.overrideWith(
            (ref) => onboardingFor(KaajRole.customer, complete: false),
          ),
        ],
      );
      expect(find.text('Post a job or find a worker'), findsOneWidget);
      expect(
        find.text(KaajLocalizations.forLanguage('en', 'কাছের কাজ খুঁজুন')),
        findsNothing,
      );
    });

    testWidgets('a worker still sees the find-work page', (tester) async {
      await pumpRouted(
        tester,
        api: FakeApi(),
        home: const OnboardingTourScreen(),
        overrides: [
          onboardingControllerProvider.overrideWith(
            (ref) => onboardingFor(KaajRole.worker, complete: false),
          ),
        ],
      );
      expect(
        find.text(KaajLocalizations.forLanguage('en', 'কাছের কাজ খুঁজুন')),
        findsOneWidget,
      );
    });
  });

  testWidgets('N12: the Post a job tile opens job posting from near its edge', (
    tester,
  ) async {
    final router = await pumpRouted(
      tester,
      api: FakeApi(),
      home: const HomeScreen(),
      size: const Size(400, 2400),
      overrides: [
        meAs(KaajRole.customer),
        notificationsProvider.overrideWith(
          (ref) async => const NotificationInbox(items: [], unreadCount: 0),
        ),
      ],
    );
    final tile = find.ancestor(
      of: find.text(KaajLocalizations.forLanguage('en', 'সময়সহ নতুন কাজ দিন')),
      matching: find.byType(Card),
    );
    // Near the left edge of the tile, not only its centre.
    await tester.tapAt(
      tester
          .getCenter(tile)
          .translate(-(tester.getSize(tile).width / 2) + 2, 0),
    );
    await tester.pumpAndSettle();
    // The test router serves /jobs/create through its /jobs/:id page.
    expect(
      router.routerDelegate.currentConfiguration.last.matchedLocation,
      '/jobs/create',
    );
  });

  testWidgets('composed keyboard text is saved as typed', (tester) async {
    final api = FakeApi()
      ..on('GET /profiles/me', FakeResponse.data(myProfileJson()))
      ..on('PUT /profiles/me', FakeResponse.data({}));
    await pumpRouted(
      tester,
      api: api,
      initial: '/profile/edit',
      size: const Size(400, 1400),
    );
    await tester.showKeyboard(find.byType(TextFormField).first);
    // Gboard's Bangla transliteration still composing the last word.
    tester.testTextInput.updateEditingValue(
      const TextEditingValue(
        text: 'রহিম উদ্দিন',
        selection: TextSelection.collapsed(offset: 11),
        composing: TextRange(start: 5, end: 11),
      ),
    );
    await tester.pump();
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(
      (api.called('PUT /profiles/me').single.data! as Map)['displayName'],
      'রহিম উদ্দিন',
    );
  });
}
